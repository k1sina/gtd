import ClarityCore
import ClarityKit
import SwiftUI

/// Quarterly review: score this quarter's goals (score sets status),
/// reflect, and seed next quarter's goals — mirrors the web page.
struct QuarterlyReviewView: View {
    let onFinish: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var goals: [Goal] = []
    @State private var review: Review?
    @State private var notes = ""
    @State private var newGoals: [String] = [""]
    @State private var finished = false
    @State private var busy = false
    @State private var error: String?

    private var now: Date { Date() }
    private var currentQuarter: (year: Int, quarter: Int) { quarterOf(now) }

    private var nextQuarter: (year: Int, quarter: Int) {
        let (year, quarter) = currentQuarter
        return quarter == 4 ? (year + 1, 1) : (year, quarter + 1)
    }

    private var currentGoals: [Goal] {
        goals.filter { $0.year == currentQuarter.year && $0.quarter == currentQuarter.quarter }
    }

    /// Mirrors `statusFromScore` on the web quarterly page.
    static func status(fromScore score: Int) -> GoalStatus {
        if score >= 8 { return .achieved }
        if score >= 4 { return .partial }
        return .dropped
    }

    var body: some View {
        Group {
            if finished {
                completedScreen
            } else {
                form
            }
        }
        .navigationTitle("Q\(currentQuarter.quarter) \(String(currentQuarter.year)) review")
        .task(id: session.dataEpoch) { await load() }
    }

    private var completedScreen: some View {
        ContentUnavailableView {
            Label("Q\(currentQuarter.quarter) review complete", systemImage: "party.popper")
        } description: {
            Text("Goals for Q\(nextQuarter.quarter) \(String(nextQuarter.year)) are set. Break them into projects when you're ready.")
        } actions: {
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
    }

    private var form: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section("1 · How did this quarter's goals go?") {
                if currentGoals.isEmpty {
                    Text("No goals were set for this quarter — add some under Goals & values, or skip to reflection.")
                        .foregroundStyle(.secondary)
                }
                ForEach(currentGoals) { goal in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(goal.title).font(.subheadline.weight(.medium))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) {
                                ForEach(0...10, id: \.self) { score in
                                    Button {
                                        Task { await setScore(goal, score: score) }
                                    } label: {
                                        Text("\(score)")
                                            .font(.caption.bold())
                                            .frame(width: 26, height: 26)
                                            .background(
                                                goal.score == score
                                                    ? Color.indigo
                                                    : Color.secondary.opacity(0.1),
                                                in: RoundedRectangle(cornerRadius: 6))
                                            .foregroundStyle(goal.score == score ? .white : .primary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
            Section("2 · Reflect") {
                TextField(
                    "What worked? What didn't? What did you learn? What deserves more of your time next quarter?",
                    text: $notes, axis: .vertical)
                    .lineLimit(4...8)
            }
            Section("3 · Goals for Q\(nextQuarter.quarter) \(String(nextQuarter.year))") {
                ForEach(newGoals.indices, id: \.self) { index in
                    TextField("Goal \(index + 1)", text: $newGoals[index])
                }
                Button {
                    newGoals.append("")
                } label: {
                    Label("Add another", systemImage: "plus")
                }
            }
            Section {
                Button {
                    Task { await finish() }
                } label: {
                    Text(busy ? "Finishing…" : "Finish quarterly review")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            goals = try await GoalRepository(ctx).goals()
            let period = quarterPeriod(year: currentQuarter.year, quarter: currentQuarter.quarter)
            review = try await ReviewRepository(ctx).review(type: .quarterly, periodStart: period.start)
            notes = review?.notes ?? ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func setScore(_ goal: Goal, score: Int) async {
        do {
            let ctx = try session.requireContext()
            _ = try await GoalRepository(ctx).saveGoal(
                id: goal.id, title: goal.title, description: goal.description,
                year: goal.year, quarter: goal.quarter, valueId: goal.valueId,
                status: Self.status(fromScore: score), score: score,
                reflection: goal.reflection)
            goals = try await GoalRepository(ctx).goals()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func finish() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let goalRepo = GoalRepository(ctx)
            for title in newGoals.map({ $0.trimmingCharacters(in: .whitespaces) }) where !title.isEmpty {
                _ = try await goalRepo.saveGoal(
                    id: nil, title: title, description: nil,
                    year: nextQuarter.year, quarter: nextQuarter.quarter, valueId: nil)
            }
            let repo = ReviewRepository(ctx)
            let period = quarterPeriod(year: currentQuarter.year, quarter: currentQuarter.quarter)
            var current = review
            if current == nil {
                current = try await repo.start(type: .quarterly, period: period)
            }
            guard let id = current?.id else { return }
            var patch = ReviewPatch()
            patch.checklist = ["scored": true]
            patch.notes = notes
            patch.completedAt = Date()
            _ = try await repo.update(id: id, patch: patch)
            finished = true
            await onFinish()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
