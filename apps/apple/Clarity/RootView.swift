import ClarityKit
import SwiftUI

struct RootView: View {
    @Environment(AppSession.self) private var session
    @State private var loading = true

    var body: some View {
        Group {
            if loading {
                ProgressView()
            } else if session.isSignedIn {
                MainView()
            } else {
                SignInView()
            }
        }
        .task {
            await session.bootstrap()
            loading = false
        }
    }
}
