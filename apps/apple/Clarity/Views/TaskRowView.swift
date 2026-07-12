import ClarityCore
import ClarityKit
import SwiftUI

/// One task line: complete button, title + due/recurrence hints, quadrant dot.
/// When `actionSubtask` is set (the surfaced next action of a parent task),
/// the subtask becomes the action line and the complete button completes it;
/// tapping the row still opens the parent.
struct TaskRowView: View {
    let task: TaskItem
    var dimmed = false
    var subtaskStats: (done: Int, total: Int)?
    var actionSubtask: TaskItem?
    var stalled = false
    let onComplete: () -> Void
    let onTap: () -> Void

    /// What the checkbox and main line represent.
    private var actionTask: TaskItem { actionSubtask ?? task }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onComplete) {
                Image(systemName: actionTask.status == .done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(actionTask.status == .done ? Color.green : Color.secondary)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 2) {
                if actionSubtask != nil {
                    Text(task.title)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Text(actionTask.title)
                    .strikethrough(actionTask.status == .done)
                HStack(spacing: 6) {
                    if stalled {
                        Label("stalled", systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red)
                    }
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
                    if let energy = actionTask.energy {
                        Label(energy.rawValue, systemImage: "bolt")
                            .foregroundStyle(energy.tint)
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
                .fill(actionTask.quadrant.color)
                .frame(width: 8, height: 8)
        }
        .opacity(dimmed ? 0.5 : 1)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }
}

extension Energy {
    /// Low = easy wins (green) … high = demands focus (red).
    var tint: Color {
        switch self {
        case .low: return .green
        case .medium: return .orange
        case .high: return .red
        }
    }
}
