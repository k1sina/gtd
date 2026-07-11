import ClarityCore
import ClarityKit
import SwiftUI

/// Delegated / blocked items, the ones waiting longest first — mirrors the
/// web waiting-for page.
struct WaitingView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
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
                    Text("Nothing on hold — delegate from the task editor with \"Waiting for…\".")
                        .foregroundStyle(.secondary)
                }
                ForEach(tasks) { task in
                    TaskRowView(task: task, subtaskStats: subtaskCounts[task.id]) {
                        Task { await complete(task) }
                    } onTap: {
                        editing = task
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button("Got it → Next") {
                            Task { await reactivate(task) }
                        }
                        .tint(.blue)
                    }
                }
            } footer: {
                if !tasks.isEmpty {
                    Text("Swipe right when it lands back on your plate.")
                }
            }
        }
        .navigationTitle("Waiting for")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task) { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx).tasks(statuses: [.waiting])
            tasks = try await tasksLoad.sorted { $0.updatedAt < $1.updatedAt }
            subtaskCounts = try await TaskRepository(ctx).subtaskCounts(for: tasks.map(\.id))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func reactivate(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            var patch = TaskPatch()
            patch.status = .next
            patch.clearWaitingOn = true
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
}
