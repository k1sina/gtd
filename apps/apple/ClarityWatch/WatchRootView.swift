import ClarityKit
import SwiftUI

struct WatchRootView: View {
    @Environment(AppSession.self) private var session
    @State private var loading = true

    var body: some View {
        Group {
            if loading {
                ProgressView()
            } else if session.isSignedIn {
                TabView {
                    WatchTodayView()
                    WatchCaptureView()
                    WatchHabitsView()
                }
            } else {
                WatchSignInView()
            }
        }
        .task {
            await session.bootstrap()
            loading = false
        }
    }
}
