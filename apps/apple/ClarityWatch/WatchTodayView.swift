import ClarityCore
import ClarityKit
import SwiftUI

/// Due/overdue plus top next actions; tap the circle to complete (recurring
/// tasks spawn their next occurrence, same as everywhere else).
struct WatchTodayView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var loading = true
    @State private var error: String?

    private var agenda: [TaskItem] {
        let endOfDay = Calendar.current.startOfDay(for: .now).addingTimeInterval(86_400)
        let due = tasks
            .filter { $0.dueAt.map { $0 < endOfDay } ?? false }
        let dueIds = Set(due.map(\.id))
        let top = tasks
            .filter { $0.status == .next && !dueIds.contains($0.id) && !isDeferred($0) }
        return (due + top)
            .sorted { priorityScore($0) > priorityScore($1) }
            .prefix(10)
            .map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if agenda.isEmpty && !loading {
                    Text("All clear for today.")
                        .foregroundStyle(.secondary)
                }
                ForEach(agenda) { task in
                    Button {
                        Task { await complete(task) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "circle")
                                .foregroundStyle(.secondary)
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
            .navigationTitle("Today")
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            tasks = try await TaskRepository(ctx).tasks(statuses: [.next, .scheduled, .inbox])
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
