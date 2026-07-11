import ClarityCore
import ClarityKit
import SwiftUI

/// Date-bound tasks and deferred items grouped Overdue / Today / Next 7 days
/// / Later — mirrors the web scheduled page.
struct ScheduledView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var subtaskCounts: [UUID: (done: Int, total: Int)] = [:]
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?

    private var grouped: [(bucket: ScheduledBucket, tasks: [TaskItem])] {
        let now = Date()
        let open = tasks
            .filter { $0.dueAt != nil || $0.deferUntil != nil }
            .sorted { ($0.dueAt ?? $0.deferUntil!) < ($1.dueAt ?? $1.deferUntil!) }
        return ScheduledBucket.allCases.compactMap { bucket in
            let matching = open.filter {
                scheduledBucket(for: $0.dueAt ?? $0.deferUntil!, now: now) == bucket
            }
            return matching.isEmpty ? nil : (bucket, matching)
        }
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if grouped.isEmpty && !loading {
                Section {
                    Text("Nothing scheduled — add a date while capturing (\"friday\", \"in 2 weeks\") or in the task editor.")
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(grouped, id: \.bucket) { group in
                Section("\(group.bucket.label) · \(group.tasks.count)") {
                    ForEach(group.tasks) { task in
                        TaskRowView(task: task, subtaskStats: subtaskCounts[task.id]) {
                            Task { await complete(task) }
                        } onTap: {
                            editing = task
                        }
                    }
                }
            }
        }
        .navigationTitle("Scheduled")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task) { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx)
                .tasks(statuses: [.inbox, .next, .waiting, .scheduled, .someday])
            tasks = try await tasksLoad
            subtaskCounts = try await TaskRepository(ctx).subtaskCounts(for: tasks.map(\.id))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
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
