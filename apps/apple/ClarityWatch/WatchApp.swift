import ClarityKit
import SwiftUI

@main
struct ClarityWatchApp: App {
    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environment(AppSession.shared)
        }
    }
}
