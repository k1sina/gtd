import SwiftUI
import ClarityCore

/// Today: due/overdue tasks plus the top next actions, with quick capture.
struct TodayView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var captureText = ""
    @State private var loading = true

    private var dueToday: [TaskItem] {
        let endOfDay = Calendar.current.startOfDay(for: .now).addingTimeInterval(86_400)
        return tasks
            .filter { $0.dueAt.map { $0 < endOfDay } ?? false }
            .sorted { priorityScore($0) > priorityScore($1) }
    }

    private var topPicks: [TaskItem] {
        let dueIds = Set(dueToday.map(\.id))
        return tasks
            .filter { $0.status == .next && !dueIds.contains($0.id) }
            .sorted { priorityScore($0) > priorityScore($1) }
            .prefix(5)
            .map { $0 }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Image(systemName: "plus.circle.fill").foregroundStyle(.indigo)
                        TextField("Capture anything…", text: $captureText)
                            .onSubmit { Task { await capture() } }
                    }
                }
                if !dueToday.isEmpty {
                    Section("Due & overdue") {
                        ForEach(dueToday) { task in taskRow(task) }
                    }
                }
                Section("Top priorities") {
                    if topPicks.isEmpty && !loading {
                        Text("Nothing lined up — capture something or check your inbox on the web app.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(topPicks) { task in taskRow(task) }
                }
            }
            .navigationTitle("Today")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    @ViewBuilder
    private func taskRow(_ task: TaskItem) -> some View {
        HStack(spacing: 10) {
            Button {
                Task { await complete(task) }
            } label: {
                Image(systemName: "circle")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                if let due = task.dueAt {
                    Text(due, style: .relative)
                        .font(.caption)
                        .foregroundStyle(due < .now ? .red : .secondary)
                }
            }
            Spacer()
            Circle()
                .fill(quadrantColor(task.quadrant))
                .frame(width: 8, height: 8)
        }
    }

    private func quadrantColor(_ quadrant: Quadrant) -> Color {
        switch quadrant {
        case .doFirst: return .red
        case .schedule: return .blue
        case .delegate: return .orange
        case .eliminate: return .gray
        }
    }

    private func load() async {
        guard let spaceId = session.personalSpaceId else { return }
        do {
            tasks = try await session.client
                .from("tasks")
                .select()
                .eq("space_id", value: spaceId)
                .in("status", values: ["next", "scheduled", "inbox"])
                .is("parent_task_id", value: nil)
                .execute()
                .value
        } catch {
            print("Load failed: \(error)")
        }
        loading = false
    }

    private func capture() async {
        guard let spaceId = session.personalSpaceId,
              let userId = session.userId,
              !captureText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let title = captureText.trimmingCharacters(in: .whitespaces)
        captureText = ""
        do {
            try await session.client.from("tasks").insert([
                "space_id": spaceId.uuidString,
                "created_by": userId.uuidString,
                "title": title,
                "status": "inbox",
            ]).execute()
            await load()
        } catch {
            print("Capture failed: \(error)")
        }
    }

    private func complete(_ task: TaskItem) async {
        do {
            try await session.client.from("tasks")
                .update(["status": "done", "completed_at": ISO8601DateFormatter().string(from: .now)])
                .eq("id", value: task.id.uuidString)
                .execute()
            // Recurring tasks: schedule the next occurrence (same logic as web).
            if let rule = task.recurrenceRule,
               let next = nextOccurrence(rule: rule, anchor: task.dueAt ?? .now, after: .now),
               let userId = session.userId {
                try await session.client.from("tasks").insert([
                    "space_id": task.spaceId.uuidString,
                    "created_by": userId.uuidString,
                    "title": task.title,
                    "status": "next",
                    "urgency": String(task.urgency),
                    "importance": String(task.importance),
                    "due_at": ISO8601DateFormatter().string(from: next),
                    "recurrence_rule": rule,
                    "recurrence_parent_id": (task.recurrenceParentId ?? task.id).uuidString,
                ]).execute()
            }
            await load()
        } catch {
            print("Complete failed: \(error)")
        }
    }
}
