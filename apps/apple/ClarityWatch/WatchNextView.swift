import ClarityCore
import ClarityKit
import SwiftUI

/// Next actions in the user's manual order (unplaced tasks rank by
/// leverage) — the watch's main screen. Tap the circle to complete
/// (recurring tasks spawn their next occurrence, same as everywhere else),
/// tap the row to adjust priority on the matrix.
struct WatchNextView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var loading = true
    @State private var error: String?
    @State private var editing: TaskItem?

    private var nextActions: [TaskItem] {
        tasks
            .filter { $0.status == .next && !isDeferred($0) }
            .sorted(by: userOrder())
            .prefix(15)
            .map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if nextActions.isEmpty && !loading {
                    Text("No next actions — capture something or clarify your inbox.")
                        .foregroundStyle(.secondary)
                }
                ForEach(nextActions) { task in
                    Button {
                        editing = task
                    } label: {
                        HStack(spacing: 6) {
                            Button {
                                Task { await complete(task) }
                            } label: {
                                Image(systemName: "circle")
                                    .foregroundStyle(.secondary)
                                    .frame(width: 28, height: 28)
                            }
                            .buttonStyle(.plain)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(task.title).lineLimit(2)
                                if let due = task.dueAt {
                                    Text(due, style: .relative)
                                        .font(.caption2)
                                        .foregroundStyle(due < .now ? .red : .secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Next")
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $editing) { task in
                WatchPriorityView(task: task) { await load() }
            }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            tasks = try await TaskRepository(ctx).tasks(statuses: [.next])
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
