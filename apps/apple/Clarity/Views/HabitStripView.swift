import ClarityCore
import ClarityKit
import SwiftUI

/// Compact "today's habits" checklist shown on Today — mirrors the web
/// HabitStrip (toggle + flame streak). TodayView owns the data so the row
/// only exists when a habit is due.
struct HabitStripView: View {
    let habits: [Habit]
    let logs: [HabitLog]
    let onChange: () async -> Void

    @Environment(AppSession.self) private var session

    private var today: Date { Date() }
    private var todayKey: String { Dates.dateKey(today) }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(habits) { habit in
                    chip(habit)
                }
            }
        }
    }

    private func chip(_ habit: Habit) -> some View {
        let logSet = Set(logs.filter { $0.habitId == habit.id }.map(\.logDate))
        let done = logSet.contains(todayKey)
        let streak = habitStreak(habit: habit, logDates: logSet, today: today)
        return Button {
            Task { await toggle(habit, done: !done) }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(done ? .green : .secondary)
                Text(habit.name)
                if streak > 1 {
                    Label("\(streak)", systemImage: "flame.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                done ? Color.green.opacity(0.12) : Color.secondary.opacity(0.08),
                in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func toggle(_ habit: Habit, done: Bool) async {
        guard let ctx = try? session.requireContext() else { return }
        try? await HabitRepository(ctx).setLogged(habit: habit, on: todayKey, logged: done)
        await onChange()
    }
}
