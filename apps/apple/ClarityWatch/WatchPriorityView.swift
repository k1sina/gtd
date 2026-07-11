import ClarityCore
import ClarityKit
import SwiftUI

/// Priority editor sheet: a compact Eisenhower matrix — tap or drag the dot
/// to set urgency (x) and importance (y, upward). Each gesture writes the
/// snapped values immediately on finger-up. Lives in a sheet so the drag
/// never fights the list's crown scrolling.
struct WatchPriorityView: View {
    let task: TaskItem
    let onSaved: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var urgency: Int
    @State private var importance: Int
    @State private var error: String?

    init(task: TaskItem, onSaved: @escaping () async -> Void) {
        self.task = task
        self.onSaved = onSaved
        _urgency = State(initialValue: task.urgency)
        _importance = State(initialValue: task.importance)
    }

    var body: some View {
        VStack(spacing: 6) {
            Text(task.title)
                .font(.footnote)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            WatchPriorityGrid(urgency: $urgency, importance: $importance) {
                Task { await save() }
            }
            Text(quadrant(urgency: urgency, importance: importance).label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(quadrant(urgency: urgency, importance: importance).color)
            if let error {
                Text(error).font(.caption2).foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 4)
    }

    private func save() async {
        do {
            let ctx = try session.requireContext()
            var patch = TaskPatch()
            patch.urgency = urgency
            patch.importance = importance
            _ = try await TaskRepository(ctx).update(id: task.id, patch: patch)
            error = nil
            await onSaved()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Tints + dot only — the phone matrix's corner labels don't fit a 40mm screen.
private struct WatchPriorityGrid: View {
    @Binding var urgency: Int
    @Binding var importance: Int
    let onCommit: () -> Void

    var body: some View {
        GeometryReader { geo in
            ZStack {
                tints(size: geo.size)
                lines(size: geo.size)
                Circle()
                    .fill(quadrant(urgency: urgency, importance: importance).color)
                    .frame(width: 14, height: 14)
                    .overlay(Circle().strokeBorder(.black.opacity(0.6), lineWidth: 1.5))
                    .position(dotPosition(in: geo.size))
                    .animation(.snappy(duration: 0.12), value: urgency)
                    .animation(.snappy(duration: 0.12), value: importance)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { snap($0.location, in: geo.size) }
                    .onEnded { _ in onCommit() }
            )
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Priority")
        .accessibilityValue(
            "Urgency \(urgency) of 4, importance \(importance) of 4, "
                + quadrant(urgency: urgency, importance: importance).label
        )
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: urgency = min(prioritySteps, urgency + 1)
            case .decrement: urgency = max(1, urgency - 1)
            @unknown default: return
            }
            onCommit()
        }
        .accessibilityAction(named: "Increase importance") {
            importance = min(prioritySteps, importance + 1)
            onCommit()
        }
        .accessibilityAction(named: "Decrease importance") {
            importance = max(1, importance - 1)
            onCommit()
        }
    }

    private func snap(_ point: CGPoint, in size: CGSize) {
        let value = gridValueFromFraction(fx: point.x / size.width, fy: point.y / size.height)
        if value.urgency != urgency { urgency = value.urgency }
        if value.importance != importance { importance = value.importance }
    }

    private func dotPosition(in size: CGSize) -> CGPoint {
        let f = fractionFromGridValue(urgency: urgency, importance: importance)
        return CGPoint(x: f.fx * size.width, y: f.fy * size.height)
    }

    private func tints(size: CGSize) -> some View {
        let half = CGSize(width: size.width / 2, height: size.height / 2)
        func pane(_ q: Quadrant, x: CGFloat, y: CGFloat) -> some View {
            Rectangle()
                .fill(q.color.opacity(0.25))
                .frame(width: half.width, height: half.height)
                .position(x: x, y: y)
        }
        return ZStack {
            pane(.schedule, x: half.width / 2, y: half.height / 2)
            pane(.doFirst, x: size.width - half.width / 2, y: half.height / 2)
            pane(.eliminate, x: half.width / 2, y: size.height - half.height / 2)
            pane(.delegate, x: size.width - half.width / 2, y: size.height - half.height / 2)
        }
    }

    private func lines(size: CGSize) -> some View {
        ZStack {
            ForEach([0.25, 0.5, 0.75], id: \.self) { f in
                Rectangle()
                    .fill(.white.opacity(f == 0.5 ? 0.3 : 0.12))
                    .frame(width: 1, height: size.height)
                    .position(x: size.width * f, y: size.height / 2)
                Rectangle()
                    .fill(.white.opacity(f == 0.5 ? 0.3 : 0.12))
                    .frame(width: size.width, height: 1)
                    .position(x: size.width / 2, y: size.height * f)
            }
        }
    }
}
