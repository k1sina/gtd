import ClarityCore
import SwiftUI

/// Eisenhower matrix input: drag (or tap) the dot to set urgency (x, 1...4)
/// and importance (y, 1...4 upward) together. Values snap to the 16 cell
/// centers. Note: (2, 2) doubles as the "unrated" sentinel elsewhere — a dot
/// deliberately placed there is indistinguishable.
struct PriorityMatrixView: View {
    @Binding var urgency: Int
    @Binding var importance: Int

    private var currentQuadrant: Quadrant {
        quadrant(urgency: urgency, importance: importance)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                quadrantTints(size: geo.size)
                gridLines(size: geo.size)
                cornerLabels(size: geo.size)
                Circle()
                    .fill(currentQuadrant.color)
                    .frame(width: 16, height: 16)
                    .overlay(Circle().strokeBorder(.background, lineWidth: 2))
                    .position(dotPosition(in: geo.size))
                    .animation(.snappy(duration: 0.12), value: urgency)
                    .animation(.snappy(duration: 0.12), value: importance)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { snap($0.location, in: geo.size) }
            )
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 220)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Priority")
        .accessibilityValue(
            "Urgency \(urgency) of 4, importance \(importance) of 4, \(currentQuadrant.label)"
        )
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: urgency = min(prioritySteps, urgency + 1)
            case .decrement: urgency = max(1, urgency - 1)
            @unknown default: break
            }
        }
        .accessibilityAction(named: "Increase importance") {
            importance = min(prioritySteps, importance + 1)
        }
        .accessibilityAction(named: "Decrease importance") {
            importance = max(1, importance - 1)
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

    /// Importance up, urgency right; tints split at the midline (between 2 and 3).
    private func quadrantTints(size: CGSize) -> some View {
        let half = CGSize(width: size.width / 2, height: size.height / 2)
        return ZStack {
            tint(.schedule, half: half)
                .position(x: half.width / 2, y: half.height / 2)
            tint(.doFirst, half: half)
                .position(x: size.width - half.width / 2, y: half.height / 2)
            tint(.eliminate, half: half)
                .position(x: half.width / 2, y: size.height - half.height / 2)
            tint(.delegate, half: half)
                .position(x: size.width - half.width / 2, y: size.height - half.height / 2)
        }
    }

    private func tint(_ q: Quadrant, half: CGSize) -> some View {
        Rectangle()
            .fill(q.color.opacity(q == .eliminate ? 0.12 : 0.10))
            .frame(width: half.width, height: half.height)
    }

    private func gridLines(size: CGSize) -> some View {
        ZStack {
            ForEach([0.25, 0.5, 0.75], id: \.self) { f in
                Rectangle()
                    .fill(f == 0.5 ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.quaternary))
                    .frame(width: 1, height: size.height)
                    .position(x: size.width * f, y: size.height / 2)
                Rectangle()
                    .fill(f == 0.5 ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.quaternary))
                    .frame(width: size.width, height: 1)
                    .position(x: size.width / 2, y: size.height * f)
            }
        }
    }

    private func cornerLabels(size: CGSize) -> some View {
        ZStack {
            label(Quadrant.schedule.label)
                .position(x: size.width * 0.25, y: 10)
            label(Quadrant.doFirst.label)
                .position(x: size.width * 0.75, y: 10)
            label(Quadrant.eliminate.label)
                .position(x: size.width * 0.25, y: size.height - 10)
            label(Quadrant.delegate.label)
                .position(x: size.width * 0.75, y: size.height - 10)
        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9))
            .foregroundStyle(.secondary)
    }
}
