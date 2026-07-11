import ClarityCore
import ClarityKit
import SwiftUI

/// One task line: complete button, title + due/recurrence hints, quadrant dot.
struct TaskRowView: View {
    let task: TaskItem
    var dimmed = false
    var subtaskStats: (done: Int, total: Int)?
    let onComplete: () -> Void
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onComplete) {
                Image(systemName: task.status == .done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.status == .done ? Color.green : Color.secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .strikethrough(task.status == .done)
                HStack(spacing: 6) {
                    if let due = task.dueAt {
                        Text(due, style: .relative)
                            .foregroundStyle(due < .now ? .red : .secondary)
                    }
                    if let rule = task.recurrenceRule {
                        Label(describeRule(rule), systemImage: "repeat")
                            .foregroundStyle(.secondary)
                    }
                    if let waiting = task.waitingOn, !waiting.isEmpty {
                        Label(waiting, systemImage: "hourglass")
                            .foregroundStyle(.secondary)
                    }
                    if let stats = subtaskStats, stats.total > 0 {
                        Label("\(stats.done)/\(stats.total)", systemImage: "checklist")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(task.contextTags, id: \.self) { tag in
                        Text("@\(tag)").foregroundStyle(.indigo)
                    }
                }
                .font(.caption)
                .lineLimit(1)
            }

            Spacer()

            if let minutes = task.estimatedMinutes {
                Text("\(minutes)m")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Circle()
                .fill(task.quadrant.color)
                .frame(width: 8, height: 8)
        }
        .opacity(dimmed ? 0.5 : 1)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}
