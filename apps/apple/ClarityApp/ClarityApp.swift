import SwiftUI
import Supabase

// App entry point. Add this file plus the rest of ClarityApp/ to an Xcode
// multiplatform App target (iOS + macOS), with the ClarityCore local package
// and https://github.com/supabase/supabase-swift as dependencies.

@main
struct ClarityApp: App {
    @State private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
}

/// Global app state: the Supabase client and the signed-in user.
@Observable
final class AppSession {
    // Fill in from your Supabase project (Settings → API).
    static let supabaseURL = URL(string: "https://YOUR-PROJECT.supabase.co")!
    static let supabaseAnonKey = "YOUR-ANON-KEY"

    let client = SupabaseClient(
        supabaseURL: AppSession.supabaseURL,
        supabaseKey: AppSession.supabaseAnonKey
    )

    var userId: UUID?
    var personalSpaceId: UUID?

    func bootstrap() async {
        do {
            let session = try await client.auth.session
            userId = session.user.id
            try await loadPersonalSpace()
        } catch {
            userId = nil
        }
    }

    func signIn(email: String, password: String) async throws {
        let session = try await client.auth.signIn(email: email, password: password)
        userId = session.user.id
        try await loadPersonalSpace()
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

struct RootView: View {
    @Environment(AppSession.self) private var session
    @State private var loading = true

    var body: some View {
        Group {
            if loading {
                ProgressView()
            } else if session.userId == nil {
                SignInView()
            } else {
                TodayView()
            }
        }
        .task {
            await session.bootstrap()
            loading = false
        }
    }
}
