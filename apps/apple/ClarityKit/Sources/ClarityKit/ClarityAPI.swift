import ClarityCore
import Foundation
import Supabase

/// Client for the deployed web app's API routes — the features whose secrets
/// live server-side (Anthropic key for the assistant, Google tokens for the
/// calendar/planner). Authenticates with the Supabase access token as a
/// Bearer header; the web routes accept it via createApiContext.
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

    // MARK: Day planner

    public struct PlannedBlock: Decodable, Identifiable, Sendable {
        public let id: UUID
        public let taskId: UUID?
        public let startsAt: Date
        public let endsAt: Date
        public let status: TimeBlockStatus
        public let title: String?

        enum CodingKeys: String, CodingKey {
            case id, title
            case taskId = "task_id"
            case startsAt = "starts_at"
            case endsAt = "ends_at"
            case status
        }
    }

    public struct PlanResponse: Decodable, Sendable {
        public let blocks: [PlannedBlock]
        public let calendarConnected: Bool
    }

    /// POST /api/plan — server proposes suggested blocks for the day.
    public func planDay(dateKey: String?, spaceId: UUID) async throws -> PlanResponse {
        struct Body: Encodable {
            let date: String?
            let spaceId: UUID
        }
        let data = try await request(
            "/api/plan", method: "POST", body: Body(date: dateKey, spaceId: spaceId))
        return try Self.jsonDecoder.decode(PlanResponse.self, from: data)
    }

    public struct ConfirmedBlock: Decodable, Sendable {
        public let id: UUID
        public let status: TimeBlockStatus
    }

    /// POST /api/plan/confirm — confirm blocks (creates calendar events when
    /// Google is connected).
    public func confirmPlan(blockIds: [UUID]) async throws -> [ConfirmedBlock] {
        struct Body: Encodable { let blockIds: [UUID] }
        struct Response: Decodable { let confirmed: [ConfirmedBlock] }
        let data = try await request(
            "/api/plan/confirm", method: "POST", body: Body(blockIds: blockIds))
        return try Self.jsonDecoder.decode(Response.self, from: data).confirmed
    }

    /// POST /api/plan/dismiss — drop the day's suggestions.
    public func dismissPlan(dateKey: String?) async throws {
        struct Body: Encodable { let date: String? }
        _ = try await request("/api/plan/dismiss", method: "POST", body: Body(date: dateKey))
    }

    // MARK: Calendar

    public struct CalendarEvent: Decodable, Identifiable, Sendable {
        public let id: String
        public let summary: String
        public let start: String?
        public let end: String?
        public let allDay: Bool
        public let busy: Bool

        public var startDate: Date? { start.flatMap(ClarityAPI.parseEventDate) }
        public var endDate: Date? { end.flatMap(ClarityAPI.parseEventDate) }
    }

    public struct CalendarEventsResponse: Decodable, Sendable {
        public let connected: Bool
        public let events: [CalendarEvent]
    }

    /// GET /api/calendar/events?date=YYYY-MM-DD
    public func calendarEvents(dateKey: String) async throws -> CalendarEventsResponse {
        let data = try await request(
            "/api/calendar/events", method: "GET",
            query: [URLQueryItem(name: "date", value: dateKey)])
        return try JSONDecoder().decode(CalendarEventsResponse.self, from: data)
    }

    public struct GoogleCalendar: Decodable, Identifiable, Sendable {
        public let id: String
        public let summary: String?
        public let primary: Bool
    }

    public struct GoogleCalendarsResponse: Decodable, Sendable {
        public let connected: Bool
        public let email: String?
        public let selected: String?
        public let calendars: [GoogleCalendar]
    }

    /// GET /api/google/calendars — for the calendar picker in Settings.
    public func googleCalendars() async throws -> GoogleCalendarsResponse {
        let data = try await request("/api/google/calendars", method: "GET")
        return try JSONDecoder().decode(GoogleCalendarsResponse.self, from: data)
    }

    // MARK: Decoding helpers

    /// The web routes return snake_case rows with ISO-8601 timestamps.
    static let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            if let date = parseEventDate(value) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Unparseable date: \(value)"))
        }
        return decoder
    }()

    /// ISO-8601 with or without fractional seconds, or a bare yyyy-MM-dd
    /// (all-day events).
    static func parseEventDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let plain = ISO8601DateFormatter()
        if let date = plain.date(from: value) { return date }
        if value.count == 10 {
            var components = DateComponents()
            let parts = value.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            components.year = parts[0]
            components.month = parts[1]
            components.day = parts[2]
            return Calendar.current.date(from: components)
        }
        return nil
    }
}
