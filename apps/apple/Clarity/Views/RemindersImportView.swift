import ClarityCore
import ClarityKit
import SwiftUI

/// One-way import of Apple Reminders into the current space. Lists and
/// sections become projects, list names map onto GTD statuses, completed
/// reminders arrive as done tasks. Safe to re-run: previously imported
/// reminders are skipped via tasks.external_ref.
struct RemindersImportView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    private enum Phase {
        case requesting
        case selecting
        case importing
        case done(RemindersImportSummary)
        case failed(String)
    }

    @State private var phase: Phase = .requesting
    @State private var source = EventKitRemindersSource()
    @State private var lists: [ReminderListInfo] = []
    @State private var selected: Set<String> = []
    @State private var includeCompleted = true

    /// Grocery-style lists don't fit the task model; leave them deselected.
    private static let skippedByDefault: Set<String> = ["shopping", "groceries"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Import from Apple Reminders").font(.headline)
            content
        }
        .padding(20)
        .frame(minWidth: 400, minHeight: 320)
        .task { await prepare() }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .requesting:
            Spacer()
            HStack {
                Spacer()
                ProgressView("Waiting for Reminders access…")
                Spacer()
            }
            Spacer()
            footer { EmptyView() }

        case .selecting:
            Text("Choose the lists to import into “\(spaceName)”.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            List {
                ForEach(lists) { list in
                    Toggle(isOn: binding(for: list.id)) {
                        HStack {
                            Text(list.title)
                            Spacer()
                            Text(countLabel(for: list))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            #if os(macOS)
            .listStyle(.bordered)
            #endif
            Toggle("Include completed reminders", isOn: $includeCompleted)
            Text("Lists and sections become projects; completed reminders "
                + "become done tasks. Sections, tags, and sub-task grouping "
                + "aren’t exposed by Apple’s Reminders API, so those import "
                + "flat.")
                .font(.caption)
                .foregroundStyle(.secondary)
            footer {
                Button("Import") { Task { await runImport() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(selected.isEmpty)
            }

        case .importing:
            Spacer()
            HStack {
                Spacer()
                ProgressView("Importing…")
                Spacer()
            }
            Spacer()

        case .done(let summary):
            summaryView(summary)
            footer {
                Button("Done") { dismiss() }
                    .buttonStyle(.borderedProminent)
            }

        case .failed(let message):
            Spacer()
            Label(message, systemImage: "exclamationmark.triangle")
                .foregroundStyle(.red)
            Spacer()
            footer {
                Button("Try again") { Task { await prepare() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    @ViewBuilder
    private func summaryView(_ summary: RemindersImportSummary) -> some View {
        let total = summary.importedTasks + summary.importedSubtasks
        Label("Imported \(total) task\(total == 1 ? "" : "s").",
            systemImage: "checkmark.circle.fill")
            .foregroundStyle(.green)
        VStack(alignment: .leading, spacing: 6) {
            if !summary.createdProjects.isEmpty {
                Text("New projects: \(summary.createdProjects.joined(separator: ", "))")
            }
            if summary.skippedExisting > 0 {
                Text("\(summary.skippedExisting) already imported earlier — skipped.")
            }
            if !summary.droppedRecurrences.isEmpty {
                Text("Repeat rules too complex to carry over were dropped on: "
                    + summary.droppedRecurrences.joined(separator: ", "))
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        Spacer()
    }

    private func footer(@ViewBuilder trailing: () -> some View) -> some View {
        HStack {
            Spacer()
            Button("Cancel") { dismiss() }
            trailing()
        }
    }

    private var spaceName: String {
        session.currentSpace?.name ?? "this space"
    }

    private func countLabel(for list: ReminderListInfo) -> String {
        includeCompleted && list.completedCount > 0
            ? "\(list.openCount) open · \(list.completedCount) done"
            : "\(list.openCount) open"
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { selected.contains(id) },
            set: { on in if on { selected.insert(id) } else { selected.remove(id) } })
    }

    private func prepare() async {
        phase = .requesting
        do {
            try await source.requestAccess()
            lists = try await source.lists()
            selected = Set(
                lists.filter {
                    !Self.skippedByDefault.contains($0.title.lowercased())
                }.map(\.id))
            phase = .selecting
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func runImport() async {
        phase = .importing
        do {
            let ctx = try session.requireContext()
            let reminders = await source.reminders(
                inLists: selected, includeCompleted: includeCompleted)
            let summary = try await RemindersImporter(ctx).run(reminders)
            phase = .done(summary)
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
