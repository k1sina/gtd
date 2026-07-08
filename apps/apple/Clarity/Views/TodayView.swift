import ClarityCore
import ClarityKit
import SwiftUI

/// Today: due/overdue tasks plus the top next actions, with quick capture.
struct TodayView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var subtaskCounts: [UUID: (done: Int, total: Int)] = [:]
    @State private var completedToday: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var habits: [Habit] = []
    @State private var habitLogs: [HabitLog] = []
    @State private var captureText = ""
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?

    private var dueToday: [TaskItem] {
        let endOfDay = Calendar.current.startOfDay(for: .now).addingTimeInterval(86_400)
        return tasks
            .filter { $0.dueAt.map { $0 < endOfDay } ?? false }
            .sorted { priorityScore($0) > priorityScore($1) }
    }

    private var topPicks: [TaskItem] {
        let dueIds = Set(dueToday.map(\.id))
        return tasks
            .filter { $0.status == .next && !dueIds.contains($0.id) && !isDeferred($0) }
            .sorted { priorityScore($0) > priorityScore($1) }
            .prefix(5)
            .map { $0 }
    }

    var body: some View {
        List {
            Section {
                QuickAddField(text: $captureText) { Task { await capture() } }
                let dueHabits = habits.filter { $0.isDue(on: Date()) }
                if !dueHabits.isEmpty {
                    HabitStripView(habits: dueHabits, logs: habitLogs) { await load() }
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            DayPlannerView()
            if !dueToday.isEmpty {
                Section("Due & overdue") {
                    ForEach(dueToday) { task in row(task) }
                }
            }
            Section("Top priorities") {
                if topPicks.isEmpty && !loading {
                    Text("Nothing lined up — capture something or clarify your inbox.")
                        .foregroundStyle(.secondary)
                }
                ForEach(topPicks) { task in row(task) }
            }
            if !completedToday.isEmpty {
                Section("Completed today · \(completedToday.count)") {
                    ForEach(completedToday) { task in
                        TaskRowView(task: task) {
                            Task { await uncomplete(task) }
                        } onTap: {
                            editing = task
                        }
                    }
                }
            }
        }
        .navigationTitle("Today")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { SpaceSwitcherMenu() }
        }
        #endif
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func row(_ task: TaskItem) -> some View {
        TaskRowView(task: task, subtaskStats: subtaskCounts[task.id]) {
            Task { await complete(task) }
        } onTap: {
            editing = task
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            let repo = TaskRepository(ctx)
            async let tasksLoad = repo.tasks(statuses: [.next, .scheduled, .inbox, .waiting])
            async let doneLoad = repo.tasks(
                statuses: [.done],
                completedAfter: Calendar.current.startOfDay(for: .now))
            async let projectsLoad = ProjectRepository(ctx).projects()
            let habitRepo = HabitRepository(ctx)
            async let habitsLoad = habitRepo.habits()
            async let logsLoad = habitRepo.logs(
                since: Dates.dateKey(Dates.addDays(Date(), -366)))
            tasks = try await tasksLoad
            subtaskCounts = try await repo.subtaskCounts(for: tasks.map(\.id))
            completedToday = try await doneLoad
                .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
            projects = try await projectsLoad
            habits = try await habitsLoad
            habitLogs = try await logsLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func uncomplete(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).complete(task, done: false)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func capture() async {
        let text = captureText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        captureText = ""
        do {
            let ctx = try session.requireContext()
            _ = try await TaskRepository(ctx).capture(text, projects: projects)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func complete(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).complete(task)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
