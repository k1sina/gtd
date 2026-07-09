import ClarityCore
import ClarityKit
import SwiftUI

/// Habit tracker: current week Mon–Sun per habit, with streaks, creation,
/// and archiving — mirrors the web habits page.
struct HabitsView: View {
    @Environment(AppSession.self) private var session
    @State private var habits: [Habit] = []
    @State private var logs: [HabitLog] = []
    @State private var creating = false
    @State private var loading = true
    @State private var error: String?

    private static let dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

    private var today: Date { Dates.startOfDay(Date()) }

    /// Current week, Monday..Sunday.
    private var weekDays: [Date] {
        let monday = Dates.startOfWeek(today)
        return (0..<7).map { Dates.addDays(monday, $0) }
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if habits.isEmpty && !loading {
                Section {
                    Text("No habits yet — track things like exercise, reading, or a shutdown ritual.")
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(habits) { habit in
                habitRow(habit)
                    .swipeActions(edge: .trailing) {
                        Button("Archive", role: .destructive) {
                            Task { await archive(habit) }
                        }
                    }
                    .contextMenu {
                        Button("Archive habit", role: .destructive) {
                            Task { await archive(habit) }
                        }
                    }
            }
        }
        .navigationTitle("Habits")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    creating = true
                } label: {
                    Label("New habit", systemImage: "plus")
                }
            }
        }
        .refreshable { await load() }
        .task(id: session.dataEpoch) { await load() }
        .sheet(isPresented: $creating) {
            NewHabitSheet { await load() }
        }
    }

    private func habitRow(_ habit: Habit) -> some View {
        let logSet = Set(logs.filter { $0.habitId == habit.id }.map(\.logDate))
        let streak = habitStreak(habit: habit, logDates: logSet, today: Date())
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(habit.name).font(.headline)
                Spacer()
                if streak > 0 {
                    Label("\(streak)", systemImage: "flame.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                }
            }
            HStack(spacing: 0) {
                ForEach(Array(weekDays.enumerated()), id: \.offset) { index, day in
                    dayCell(habit, day: day, label: Self.dayLabels[index], logSet: logSet)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func dayCell(_ habit: Habit, day: Date, label: String, logSet: Set<String>) -> some View {
        let key = Dates.dateKey(day)
        let scheduled = habit.isDue(on: day)
        let done = logSet.contains(key)
        let future = day > today
        let isToday = key == Dates.dateKey(today)

        VStack(spacing: 3) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(isToday ? Color.indigo : Color.secondary)
            if scheduled {
                Button {
                    Task { await toggle(habit, on: key, done: !done) }
                } label: {
                    ZStack {
                        Circle()
                            .strokeBorder(
                                done ? Color.green : future ? Color.secondary.opacity(0.2) : Color.secondary,
                                lineWidth: 1.5)
                            .background(Circle().fill(done ? Color.green : Color.clear))
                            .frame(width: 24, height: 24)
                        if done {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(future)
            } else {
                Text("·")
                    .foregroundStyle(.secondary)
                    .frame(width: 24, height: 24)
            }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            let repo = HabitRepository(ctx)
            async let habitsLoad = repo.habits()
            async let logsLoad = repo.logs(since: Dates.dateKey(Dates.addDays(today, -366)))
            habits = try await habitsLoad
            logs = try await logsLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func toggle(_ habit: Habit, on key: String, done: Bool) async {
        do {
            let ctx = try session.requireContext()
            try await HabitRepository(ctx).setLogged(habit: habit, on: key, logged: done)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func archive(_ habit: Habit) async {
        do {
            let ctx = try session.requireContext()
            try await HabitRepository(ctx).archive(id: habit.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// New-habit dialog with weekday selection (none = every day) — mirrors the
/// web dialog.
struct NewHabitSheet: View {
    let onCreate: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var weekdays: Set<Int> = []
    @State private var error: String?
    @State private var busy = false

    private static let dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Habit name (e.g. Morning run)", text: $name)
                }
                Section("Which days? (none selected = every day)") {
                    ForEach(0..<7, id: \.self) { day in
                        Toggle(Self.dayLabels[day], isOn: Binding(
                            get: { weekdays.contains(day) },
                            set: { on in
                                if on { weekdays.insert(day) } else { weekdays.remove(day) }
                            }))
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("New habit")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Creating…" : "Create") { Task { await create() } }
                        .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 420)
        #endif
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            _ = try await HabitRepository(ctx).create(
                name: name.trimmingCharacters(in: .whitespaces),
                weekdays: Array(weekdays))
            await onCreate()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
