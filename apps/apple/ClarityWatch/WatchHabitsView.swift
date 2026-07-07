import ClarityCore
import ClarityKit
import SwiftUI

/// Today's habits; tap to log or unlog.
struct WatchHabitsView: View {
    @Environment(AppSession.self) private var session
    @State private var habits: [Habit] = []
    @State private var loggedToday: Set<UUID> = []
    @State private var loading = true
    @State private var error: String?

    private var dueToday: [Habit] {
        habits.filter { $0.isDue(on: .now) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                if dueToday.isEmpty && !loading {
                    Text("No habits scheduled today.")
                        .foregroundStyle(.secondary)
                }
                ForEach(dueToday) { habit in
                    Button {
                        Task { await toggle(habit) }
                    } label: {
                        HStack {
                            Image(
                                systemName: loggedToday.contains(habit.id)
                                    ? "checkmark.circle.fill" : "circle"
                            )
                            .foregroundStyle(
                                loggedToday.contains(habit.id) ? Color.green : Color.secondary)
                            Text(habit.name)
                        }
                    }
                }
            }
            .navigationTitle("Habits")
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            let repository = HabitRepository(ctx)
            let today = HabitRepository.dateKey()
            habits = try await repository.habits()
            loggedToday = Set(
                try await repository.logs(since: today)
                    .filter { $0.logDate == today }
                    .map(\.habitId))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func toggle(_ habit: Habit) async {
        let today = HabitRepository.dateKey()
        let logged = loggedToday.contains(habit.id)
        do {
            let ctx = try session.requireContext()
            try await HabitRepository(ctx).setLogged(habit: habit, on: today, logged: !logged)
            if logged { loggedToday.remove(habit.id) } else { loggedToday.insert(habit.id) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
