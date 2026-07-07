import ClarityCore
import ClarityKit
import SwiftUI

/// Today: due/overdue tasks plus the top next actions, with quick capture.
struct TodayView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var captureText = ""
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?

    private var dueToday: [TaskItem] {
        let endOfDay = Calendar.current.startOfDay(for: .now).addingTimeInterval(86_400)
        return tasks
            .filter { $0.dueAt.map { $0 < endOfDay } ?? false }
            .sorted { priorityScore($0) > priorityScore($1) }
    }

    private var topPicks: [TaskItem] {
        let dueIds = Set(dueToday.map(\.id))
        return tasks
            .filter { $0.status == .next && !dueIds.contains($0.id) && !isDeferred($0) }
            .sorted { priorityScore($0) > priorityScore($1) }
            .prefix(5)
            .map { $0 }
    }

    var body: some View {
        List {
            Section {
                QuickAddField(text: $captureText) { Task { await capture() } }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if !dueToday.isEmpty {
                Section("Due & overdue") {
                    ForEach(dueToday) { task in row(task) }
                }
            }
            Section("Top priorities") {
                if topPicks.isEmpty && !loading {
                    Text("Nothing lined up — capture something or clarify your inbox.")
                        .foregroundStyle(.secondary)
                }
                ForEach(topPicks) { task in row(task) }
            }
        }
        .navigationTitle("Today")
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func row(_ task: TaskItem) -> some View {
        TaskRowView(task: task) {
            Task { await complete(task) }
        } onTap: {
            editing = task
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx)
                .tasks(statuses: [.next, .scheduled, .inbox, .waiting])
            async let projectsLoad = ProjectRepository(ctx).projects()
            tasks = try await tasksLoad
            projects = try await projectsLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func capture() async {
        let text = captureText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        captureText = ""
        do {
            let ctx = try session.requireContext()
            _ = try await TaskRepository(ctx).capture(text, projects: projects)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func complete(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).complete(task)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
