import ClarityCore
import ClarityKit
import SwiftUI

/// Someday/maybe: ideas parked for later — rescanned during the weekly
/// review. Mirrors the web someday page.
struct SomedayView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var subtaskCounts: [UUID: (done: Int, total: Int)] = [:]
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                if tasks.isEmpty && !loading {
                    Text("Nothing parked — capture with \"!someday\" or file inbox items here.")
                        .foregroundStyle(.secondary)
                }
                ForEach(tasks) { task in
                    TaskRowView(task: task, subtaskStats: subtaskCounts[task.id]) {
                        Task { await complete(task) }
                    } onTap: {
                        editing = task
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button("Activate") {
                            Task { await activate(task) }
                        }
                        .tint(.blue)
                    }
                    .swipeActions(edge: .trailing) {
                        Button("Delete", role: .destructive) {
                            Task { await remove(task) }
                        }
                    }
                }
            } footer: {
                if !tasks.isEmpty {
                    Text("Swipe right to make something a next action.")
                }
            }
        }
        .navigationTitle("Someday/maybe")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx).tasks(statuses: [.someday])
            async let projectsLoad = ProjectRepository(ctx).projects()
            tasks = try await tasksLoad.sorted { $0.createdAt > $1.createdAt }
            subtaskCounts = try await TaskRepository(ctx).subtaskCounts(for: tasks.map(\.id))
            projects = try await projectsLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func activate(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            var patch = TaskPatch()
            patch.status = .next
            _ = try await TaskRepository(ctx).update(id: task.id, patch: patch)
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

    private func remove(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).delete(id: task.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
