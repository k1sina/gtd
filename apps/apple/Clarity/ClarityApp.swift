import ClarityKit
import SwiftUI

@main
struct ClarityApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(AppSession.shared)
        }
        #if os(macOS)
        .defaultSize(width: 900, height: 620)
        #endif
    }
}
