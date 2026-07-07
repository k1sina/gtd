import AppIntents
import Supabase

// Siri / Shortcuts capture: “Add buy milk to Clarity”.
// Requires the app target to include this file; App Shortcuts are registered
// automatically at install. Works from Siri, Spotlight, and the Shortcuts app,
// including on Apple Watch when the watch app shares the target.

struct AddTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add to Clarity Inbox"
    static let description = IntentDescription(
        "Captures a task straight into your Clarity inbox."
    )
    // Capture must work without opening the app — that's the whole point.
    static let openAppWhenRun = false

    @Parameter(title: "Task", requestValueDialog: "What should I capture?")
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let session = AppSession()
        await session.bootstrap()
        guard let spaceId = session.personalSpaceId, let userId = session.userId else {
            return .result(dialog: "Please sign in to Clarity first.")
        }
        try await session.client.from("tasks").insert([
            "space_id": spaceId.uuidString,
            "created_by": userId.uuidString,
            "title": text,
            "status": "inbox",
        ]).execute()
        return .result(dialog: "Captured “\(text)”.")
    }
}

struct ClarityShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add \(\.$text) to \(.applicationName)",
                "Capture \(\.$text) in \(.applicationName)",
                "\(.applicationName) capture",
            ],
            shortTitle: "Quick capture",
            systemImageName: "tray.and.arrow.down.fill"
        )
    }
}
