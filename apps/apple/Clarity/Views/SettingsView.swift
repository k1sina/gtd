import ClarityCore
import ClarityKit
import SwiftUI

/// Account, space, and (in shared spaces) sharing management — mirrors the
/// web settings page. Calendar & planning preferences live in
/// PlannerSettingsSection once the web API is configured.
struct SettingsView: View {
    @Environment(AppSession.self) private var session
    @State private var showJoin = false
    @State private var showRemindersImport = false

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return version ?? "—"
    }

    var body: some View {
        List {
            Section("Account") {
                if let profile = session.profile {
                    LabeledContent("Name", value: profile.displayName)
                    LabeledContent("Email", value: profile.email)
                }
                Button("Sign out", role: .destructive) {
                    Task { await session.signOut() }
                }
            }

            Section("Space") {
                SpaceSwitcherMenu()
                Button("Join a space…") { showJoin = true }
            }

            if session.currentSpace?.isPersonal == false {
                SharingSettingsSection()
            } else {
                Section {
                    Text("This is your personal space — only you can see it. Create or join a shared space to collaborate.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            PlannerSettingsSection()

            Section("Data") {
                Button("Import from Apple Reminders…") { showRemindersImport = true }
            }

            Section("About") {
                LabeledContent("Version", value: appVersion)
            }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $showJoin) { JoinSpaceSheet() }
        .sheet(isPresented: $showRemindersImport) { RemindersImportView() }
    }
}
