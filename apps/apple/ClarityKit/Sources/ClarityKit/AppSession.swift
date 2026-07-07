import ClarityCore
import Foundation
import Observation
import Supabase

public enum SessionError: Error, LocalizedError {
    case notSignedIn

    public var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Please sign in to Clarity first."
        }
    }
}

/// Everything a repository needs to act as the signed-in user; RLS on the
/// backend scopes all queries to the user's spaces.
public struct RepositoryContext: Sendable {
    public let client: SupabaseClient
    public let userId: UUID
    public let spaceId: UUID
}

/// Global app state: the Supabase client and the signed-in user. `shared` is
/// what App Intents use, so Siri and the UI act on one session.
@MainActor
@Observable
public final class AppSession {
    public static let shared = AppSession()

    public let client: SupabaseClient
    public private(set) var userId: UUID?
    public private(set) var personalSpaceId: UUID?

    public init(config: SupabaseConfig = .fromBundle()) {
        client = SupabaseClient(
            supabaseURL: config.url,
            supabaseKey: config.anonKey,
            options: SupabaseClientOptions(
                db: .init(encoder: PostgrestJSON.encoder, decoder: PostgrestJSON.decoder)
            )
        )
    }

    public var isSignedIn: Bool { userId != nil }

    /// Restore a persisted session (keychain) if there is one.
    public func bootstrap() async {
        do {
            let session = try await client.auth.session
            userId = session.user.id
            try await loadPersonalSpace()
        } catch {
            userId = nil
        }
    }

    public func signIn(email: String, password: String) async throws {
        let session = try await client.auth.signIn(email: email, password: password)
        userId = session.user.id
        try await loadPersonalSpace()
    }

    public func signOut() async {
        try? await client.auth.signOut()
        userId = nil
        personalSpaceId = nil
    }

    public func requireContext() throws -> RepositoryContext {
        guard let userId, let spaceId = personalSpaceId else {
            throw SessionError.notSignedIn
        }
        return RepositoryContext(client: client, userId: userId, spaceId: spaceId)
    }

    /// Bootstrap if needed, then return a context — the one-liner App Intents use.
    public func readyContext() async throws -> RepositoryContext {
        if userId == nil || personalSpaceId == nil {
            await bootstrap()
        }
        return try requireContext()
    }

    private func loadPersonalSpace() async throws {
        struct SpaceRow: Decodable { let id: UUID }
        let rows: [SpaceRow] = try await client
            .from("spaces")
            .select("id")
            .eq("is_personal", value: true)
            .limit(1)
            .execute()
            .value
        personalSpaceId = rows.first?.id
    }
}
