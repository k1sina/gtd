import ClarityCore
import Foundation
import Supabase

/// Client for the deployed web app's API routes — the features whose secrets
/// live server-side (the Anthropic key for the assistant). Authenticates with
/// the Supabase access token as a Bearer header; the web routes accept it via
/// createApiContext.
public struct ClarityAPI: Sendable {
    public enum APIError: Error, LocalizedError {
        case notConfigured
        case assistantNotConfigured
        case http(Int, String?)

        public var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Web app URL is not configured (WebAppBaseURL)."
            case .assistantNotConfigured:
                return "The assistant isn't configured on the server (missing Anthropic API key)."
            case .http(let status, let message):
                return message ?? "Request failed (\(status))."
            }
        }
    }

    let baseURL: URL
    let client: SupabaseClient

    /// The deployed web app's base URL from Info.plist (fed by
    /// Configs/Supabase.xcconfig via project.yml).
    public static var webBaseURL: String {
        (Bundle.main.object(forInfoDictionaryKey: "WebAppBaseURL") as? String)
            .flatMap { $0.isEmpty ? nil : $0 }
            ?? "https://gtd-web-keivan-sinas-projects.vercel.app"
    }

    public init?(client: SupabaseClient, baseURL: URL? = nil) {
        guard let url = baseURL ?? URL(string: Self.webBaseURL) else { return nil }
        self.baseURL = url
        self.client = client
    }

    // MARK: Requests

    private struct ErrorBody: Decodable {
        let error: String?
    }

    private func request(
        _ path: String, method: String, query: [URLQueryItem] = [],
        body: (some Encodable)? = nil as String?, timeout: TimeInterval = 60
    ) async throws -> Data {
        var components = URLComponents(
            url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!, timeoutInterval: timeout)
        request.httpMethod = method
        // client.auth.session refreshes the token if needed.
        let token = try await client.auth.session.accessToken
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            if status == 501 || message == "assistant_not_configured" {
                throw APIError.assistantNotConfigured
            }
            throw APIError.http(status, message)
        }
        return data
    }

    // MARK: Assistant

    public struct ChatResponse: Decodable, Sendable {
        public let sessionId: UUID
        /// The assistant messages produced this turn (arrays of content blocks).
        public let messages: [[ChatBlock]]
    }

    /// POST /api/chat — runs the server-side agent loop (may take minutes).
    public func chat(message: String, spaceId: UUID, sessionId: UUID?) async throws -> ChatResponse {
        struct Body: Encodable {
            let message: String
            let spaceId: UUID
            let sessionId: UUID?
        }
        let data = try await request(
            "/api/chat", method: "POST",
            body: Body(message: message, spaceId: spaceId, sessionId: sessionId),
            timeout: 300)
        return try JSONDecoder().decode(ChatResponse.self, from: data)
    }

}
