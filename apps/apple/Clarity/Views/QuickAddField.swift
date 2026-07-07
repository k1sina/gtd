import ClarityCore
import SwiftUI

/// Capture field with a live preview of what the natural-language parser
/// understood ("tomorrow at 3pm @phone #Family !urgent ~15m every week").
struct QuickAddField: View {
    @Binding var text: String
    var placeholder = "Capture anything…"
    let onSubmit: () -> Void

    private var parsed: ParsedQuickAdd? {
        text.isEmpty ? nil : parseQuickAdd(text)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "plus.circle.fill").foregroundStyle(.indigo)
                TextField(placeholder, text: $text)
                    .textFieldStyle(.plain)
                    .onSubmit(onSubmit)
            }
            if let parsed, !chips(for: parsed).isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(chips(for: parsed), id: \.self) { chip in
                            Text(chip)
                                .font(.caption2)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.indigo.opacity(0.12), in: Capsule())
                        }
                    }
                }
            }
        }
    }

    private func chips(for parsed: ParsedQuickAdd) -> [String] {
        var chips: [String] = []
        if let due = parsed.dueAt {
            chips.append(due.formatted(date: .abbreviated, time: .shortened))
        }
        if let rule = parsed.recurrenceRule { chips.append(describeRule(rule)) }
        if let minutes = parsed.estimatedMinutes { chips.append("~\(minutes)m") }
        if parsed.urgency == 4 { chips.append("urgent") }
        if parsed.importance == 4 { chips.append("important") }
        if parsed.someday { chips.append("someday") }
        if let hint = parsed.projectHint { chips.append("#\(hint)") }
        chips.append(contentsOf: parsed.tags.map { "@\($0)" })
        return chips
    }
}
