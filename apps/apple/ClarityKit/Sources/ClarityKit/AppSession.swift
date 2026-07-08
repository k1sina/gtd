import ClarityCore
import Foundation
import Observation
import Supabase

public enum SessionError: Error, LocalizedError {
    case notSignedIn
    case confirmationRequired

    public var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Please sign in to Clarity first."
        case .confirmationRequired:
            return "Check your email to confirm your account, then sign in."
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

/// Global app state: the Supabase client, the signed-in user, and the
/// selected space. `shared` is what App Intents use, so Siri and the UI act
/// on one session.
@MainActor
@Observable
public final class AppSession {
    public static let shared = AppSession()

    /// Mirrors the web's localStorage key.
    private static let spaceDefaultsKey = "clarity.currentSpaceId"

    public let client: SupabaseClient
    public private(set) var userId: UUID?
    public private(set) var profile: Profile?
    public private(set) var spaces: [Space] = []
    public private(set) var currentSpaceId: UUID?
    /// Bumped whenever the selected space changes; views key their `.task`
    /// loaders on it so a space switch reloads everything.
    public private(set) var dataEpoch = 0
    /// Bumped (debounced) when realtime reports a remote change to tasks,
    /// projects, or comments in the current space.
    public private(set) var remoteVersion = 0
    /// Key task-list views' `.task(id:)` on this so both space switches and
    /// remote edits trigger a refetch. Strictly increasing.
    public var reloadKey: Int { dataEpoch + remoteVersion }

    private var realtimeTask: Task<Void, Never>?
    private var realtimeChannel: RealtimeChannelV2?
    private var pendingRemoteBump: Task<Void, Never>?

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

    public var currentSpace: Space? {
        spaces.first { $0.id == currentSpaceId }
    }

    public var personalSpaceId: UUID? {
        spaces.first { $0.isPersonal }?.id
    }

    /// Restore a persisted session (keychain) if there is one.
    public func bootstrap() async {
        do {
            let session = try await client.auth.session
            userId = session.user.id
            try await loadSpaces()
        } catch {
            userId = nil
        }
    }

    public func signIn(email: String, password: String) async throws {
        let session = try await client.auth.signIn(email: email, password: password)
        userId = session.user.id
        try await loadSpaces()
    }

    /// Create an account. The `handle_new_user` trigger provisions the
    /// profile and personal space. Throws `.confirmationRequired` when the
    /// project requires email confirmation (no session yet).
    public func signUp(email: String, password: String, displayName: String) async throws {
        let name = displayName.trimmingCharacters(in: .whitespaces)
        let response = try await client.auth.signUp(
            email: email,
            password: password,
            data: name.isEmpty ? [:] : ["display_name": .string(name)]
        )
        guard let session = response.session else {
            throw SessionError.confirmationRequired
        }
        userId = session.user.id
        try await loadSpaces()
    }

    public func signOut() async {
        stopRealtime()
        try? await client.auth.signOut()
        userId = nil
        profile = nil
        spaces = []
        currentSpaceId = nil
        dataEpoch += 1
    }

    // MARK: Realtime

    /// Subscribe to postgres changes for the current space (tasks, projects,
    /// task_comments — the tables in the realtime publication) and bump
    /// `remoteVersion` when anything changes. Best-effort: views always
    /// fetch on appear regardless. The iOS/macOS app calls this; the watch
    /// doesn't.
    public func startRealtime() {
        stopRealtime()
        guard let spaceId = currentSpaceId else { return }
        let client = client
        realtimeTask = Task { [weak self] in
            let channel = client.channel("space-\(spaceId.uuidString.lowercased())")
            self?.realtimeChannel = channel
            let tasks = channel.postgresChange(
                AnyAction.self, table: "tasks", filter: .eq("space_id", value: spaceId))
            let projects = channel.postgresChange(
                AnyAction.self, table: "projects", filter: .eq("space_id", value: spaceId))
            let comments = channel.postgresChange(
                AnyAction.self, table: "task_comments", filter: .eq("space_id", value: spaceId))
            try? await channel.subscribeWithError()
            await withTaskGroup(of: Void.self) { group in
                group.addTask { @MainActor [weak self] in
                    for await _ in tasks { self?.noteRemoteChange() }
                }
                group.addTask { @MainActor [weak self] in
                    for await _ in projects { self?.noteRemoteChange() }
                }
                group.addTask { @MainActor [weak self] in
                    for await _ in comments { self?.noteRemoteChange() }
                }
            }
        }
    }

    public func stopRealtime() {
        realtimeTask?.cancel()
        realtimeTask = nil
        pendingRemoteBump?.cancel()
        pendingRemoteBump = nil
        if let channel = realtimeChannel {
            realtimeChannel = nil
            Task { await channel.unsubscribe() }
        }
    }

    /// Coalesce bursts of change events into one refetch.
    private func noteRemoteChange() {
        guard pendingRemoteBump == nil else { return }
        pendingRemoteBump = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            self?.remoteVersion += 1
            self?.pendingRemoteBump = nil
        }
    }

    /// Load the user's spaces and profile; keeps the persisted space
    /// selection when it is still visible, else falls back to personal.
    public func loadSpaces() async throws {
        spaces = try await client
            .from("spaces")
            .select()
            .order("is_personal", ascending: false)
            .order("created_at")
            .execute()
            .value

        if let userId {
            profile = try? await client
                .from("profiles")
                .select()
                .eq("id", value: userId.uuidString)
                .single()
                .execute()
                .value
        }

        let persisted = UserDefaults.standard.string(forKey: Self.spaceDefaultsKey)
            .flatMap(UUID.init(uuidString:))
        if let persisted, spaces.contains(where: { $0.id == persisted }) {
            if currentSpaceId != persisted { switchSpace(to: persisted) }
        } else if currentSpaceId == nil || !spaces.contains(where: { $0.id == currentSpaceId }) {
            currentSpaceId = personalSpaceId ?? spaces.first?.id
        }
    }

    public func switchSpace(to id: UUID) {
        guard currentSpaceId != id else { return }
        currentSpaceId = id
        UserDefaults.standard.set(id.uuidString, forKey: Self.spaceDefaultsKey)
        dataEpoch += 1
    }

    /// Accept a space invite by token (from a pasted invite link) and switch
    /// into the joined space. Returns the space id.
    @discardableResult
    public func acceptInvite(token: UUID) async throws -> UUID {
        struct Params: Encodable {
            let inviteToken: UUID
        }
        let spaceId: UUID = try await client
            .rpc("accept_space_invite", params: Params(inviteToken: token))
            .execute()
            .value
        try await loadSpaces()
        switchSpace(to: spaceId)
        return spaceId
    }

    public func requireContext() throws -> RepositoryContext {
        guard let userId, let spaceId = currentSpaceId else {
            throw SessionError.notSignedIn
        }
        return RepositoryContext(client: client, userId: userId, spaceId: spaceId)
    }

    /// Bootstrap if needed, then return a context — the one-liner App Intents use.
    public func readyContext() async throws -> RepositoryContext {
        if userId == nil || currentSpaceId == nil {
            await bootstrap()
        }
        return try requireContext()
    }
}
