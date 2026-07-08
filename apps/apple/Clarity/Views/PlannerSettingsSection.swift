import ClarityCore
import ClarityKit
import SwiftUI

/// Google Calendar status + daily-planning preferences — mirrors the web
/// settings page. OAuth connect itself happens on the web; here we show the
/// connection, pick the calendar, and edit planner preferences.
struct PlannerSettingsSection: View {
    @Environment(AppSession.self) private var session
    @State private var account: CalendarAccountInfo?
    @State private var calendars: [ClarityAPI.GoogleCalendar] = []
    @State private var config = PlannerConfig.default
    @State private var loaded = false
    @State private var saved = false
    @State private var error: String?

    private static let blockChoices = [25, 45, 60, 90]

    var body: some View {
        Section("Calendar") {
            if let account {
                LabeledContent("Google Calendar", value: account.email)
                if !calendars.isEmpty {
                    Picker("Calendar", selection: calendarBinding) {
                        ForEach(calendars) { calendar in
                            Text(calendar.summary ?? calendar.id).tag(calendar.id)
                        }
                    }
                }
            } else if loaded {
                Text("Connect Google Calendar on the web app to see events in Today and sync focus blocks.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Link("Open web settings", destination: URL(string: "\(ClarityAPI.webBaseURL)/settings")!)
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        }
        .task(id: session.dataEpoch) { await load() }

        if account != nil {
            Section("Daily planning") {
                timePicker("Workday starts", selection: $config.workStart, hours: 6..<13)
                timePicker("Workday ends", selection: $config.workEnd, hours: 14..<23)
                Picker("Focus block length", selection: $config.defaultBlockMinutes) {
                    // A value saved on the web may not be one of our presets —
                    // keep it selectable rather than showing a blank picker.
                    if !Self.blockChoices.contains(config.defaultBlockMinutes) {
                        Text("\(config.defaultBlockMinutes) min").tag(config.defaultBlockMinutes)
                    }
                    ForEach(Self.blockChoices, id: \.self) { minutes in
                        Text("\(minutes) min").tag(minutes)
                    }
                }
                Stepper("Max blocks per day: \(config.maxBlocks)", value: $config.maxBlocks, in: 1...12)
                Button(saved ? "Saved" : "Save preferences") {
                    Task { await save() }
                }
                .disabled(saved)
            }
        }
    }

    /// Hour picker that also offers the currently stored value when it isn't
    /// a whole hour in our range (e.g. "08:30" set on the web).
    private func timePicker(_ title: String, selection: Binding<String>, hours: Range<Int>) -> some View {
        let options = hours.map { String(format: "%02d:00", $0) }
        return Picker(title, selection: selection) {
            if !options.contains(selection.wrappedValue) {
                Text(selection.wrappedValue).tag(selection.wrappedValue)
            }
            ForEach(options, id: \.self) { option in
                Text(option).tag(option)
            }
        }
    }

    private var calendarBinding: Binding<String> {
        Binding(
            get: { account?.calendarId ?? "primary" },
            set: { newValue in
                Task { await selectCalendar(newValue) }
            })
    }

    private func load() async {
        guard let ctx = try? session.requireContext() else { return }
        do {
            account = try await PlannerRepository(ctx).calendarAccount()
            if let account {
                config = account.settings
                if let api = ClarityAPI(client: ctx.client),
                   let response = try? await api.googleCalendars() {
                    calendars = response.calendars
                }
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func selectCalendar(_ calendarId: String) async {
        guard let account, let ctx = try? session.requireContext() else { return }
        do {
            try await PlannerRepository(ctx).updateCalendarAccount(
                id: account.id, calendarId: calendarId)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        guard let account, let ctx = try? session.requireContext() else { return }
        do {
            try await PlannerRepository(ctx).updateCalendarAccount(
                id: account.id, settings: config)
            saved = true
            error = nil
            Task {
                try? await Task.sleep(for: .seconds(2))
                saved = false
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
