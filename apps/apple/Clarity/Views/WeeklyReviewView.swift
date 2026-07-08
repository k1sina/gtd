import ClarityCore
import ClarityKit
import SwiftUI

/// Guided 6-step weekly review — mirrors the web flow (same step keys, so a
/// review started on one platform resumes on the other).
struct WeeklyReviewView: View {
    let onFinish: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    private static let steps: [(key: String, title: String)] = [
        ("inbox", "Get to inbox zero"),
        ("calendar", "Review your calendar ± 2 weeks"),
        ("projects", "Give every project a next action"),
        ("waiting", "Chase up Waiting-For items"),
        ("someday", "Rescan Someday / maybe"),
        ("priorities", "Set this week's priorities"),
    ]

    @State private var step = 0
    @State private var review: Review?
    @State private var notes = ""
    @State private var finished = false
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var editing: TaskItem?
    @State private var error: String?
    @State private var busy = false

    private var checklist: [String: Bool] { review?.checklist ?? [:] }

    private var open: [TaskItem] {
        tasks.filter { $0.status != .done && $0.status != .cancelled }
    }

    var body: some View {
        Group {
            if finished {
                completedScreen
            } else {
                reviewForm
            }
        }
        .navigationTitle("Weekly review")
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(project: project)
        }
        // Space switches restart the review (load resets step/notes)…
        .task(id: session.dataEpoch) { await load() }
        // …but realtime echoes only refresh the task/project lists — they
        // must never clobber the in-progress step or unsaved notes.
        .task(id: session.reloadKey) { await loadData() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await loadData() }
        }
    }

    private var completedScreen: some View {
        ContentUnavailableView {
            Label("Weekly review complete", systemImage: "party.popper")
        } description: {
            Text("Your system is current. Trust it, and get back to doing.")
        } actions: {
            Button("Done") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
    }

    private var reviewForm: some View {
        List {
            Section {
                HStack(spacing: 4) {
                    ForEach(Array(Self.steps.enumerated()), id: \.offset) { index, s in
                        Capsule()
                            .fill(index < step || checklist[s.key] == true
                                ? Color.green
                                : index == step ? Color.indigo : Color.secondary.opacity(0.2))
                            .frame(height: 5)
                            .onTapGesture { step = index }
                    }
                }
                .listRowBackground(Color.clear)
                Text("Step \(step + 1) of \(Self.steps.count) · \(Self.steps[step].title)")
                    .font(.headline)
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            stepContent
            Section {
                Button {
                    Task { await completeStep() }
                } label: {
                    Text(step < Self.steps.count - 1
                        ? (busy ? "Saving…" : "Mark done & continue")
                        : (busy ? "Finishing…" : "Finish review"))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(busy)
            }
        }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch Self.steps[step].key {
        case "inbox":
            let inbox = open.filter { $0.status == .inbox }
            Section {
                if inbox.isEmpty {
                    Label("Inbox zero — nothing to clarify.", systemImage: "checkmark")
                        .foregroundStyle(.green)
                } else {
                    Text("\(inbox.count) item\(inbox.count == 1 ? "" : "s") waiting — clarify them from the Inbox tab and come back.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    ForEach(inbox.prefix(8)) { task in taskRow(task) }
                }
            }
        case "calendar":
            let twoWeeksAgo = Dates.addDays(Dates.startOfDay(Date()), -14)
            let twoWeeksOut = Dates.addDays(Dates.startOfDay(Date()), 15)
            let dated = open
                .filter { task in
                    guard let due = task.dueAt else { return false }
                    return due >= twoWeeksAgo && due < twoWeeksOut
                }
                .sorted { ($0.dueAt ?? .distantPast) < ($1.dueAt ?? .distantPast) }
            Section {
                Text("Anything date-bound in the last and next two weeks — reschedule what slipped, prepare for what's coming.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if dated.isEmpty {
                    Text("Nothing scheduled.").foregroundStyle(.secondary)
                } else {
                    ForEach(dated) { task in taskRow(task) }
                }
            }
        case "projects":
            let active = projects.filter { $0.status == .active }
            let stalled = active.filter { project in
                !open.contains { $0.projectId == project.id && $0.status == .next }
            }
            Section {
                if stalled.isEmpty {
                    Label("All \(active.count) active projects have a next action.", systemImage: "checkmark")
                        .foregroundStyle(.green)
                } else {
                    Text("\(stalled.count) of \(active.count) active projects have no next action:")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                    ForEach(stalled) { project in
                        NavigationLink(value: project) {
                            Text(project.name)
                        }
                    }
                }
            }
        case "waiting":
            let waiting = open.filter { $0.status == .waiting }
            Section {
                Text("Still waiting? Nudge them. Resolved? Check it off.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if waiting.isEmpty {
                    Text("Not waiting on anything.").foregroundStyle(.secondary)
                } else {
                    ForEach(waiting) { task in taskRow(task) }
                }
            }
        case "someday":
            let someday = open.filter { $0.status == .someday }
            Section {
                Text("Has anything become relevant? Open it and move it to Next — or delete what no longer excites you.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if someday.isEmpty {
                    Text("The someday list is empty.").foregroundStyle(.secondary)
                } else {
                    ForEach(someday.prefix(10)) { task in taskRow(task) }
                }
            }
        default: // priorities
            let top = open
                .filter { $0.status == .next }
                .sorted { priorityScore($0) > priorityScore($1) }
                .prefix(7)
            Section {
                Text("Your current top next actions by priority — adjust urgency and importance so the right things float to the top, then jot down your intent for the week.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                ForEach(Array(top)) { task in taskRow(task) }
                TextField("Notes for the week…", text: $notes, axis: .vertical)
                    .lineLimit(3...6)
            }
        }
    }

    private func taskRow(_ task: TaskItem) -> some View {
        TaskRowView(task: task) {
            Task {
                guard let ctx = try? session.requireContext() else { return }
                _ = try? await TaskRepository(ctx).complete(task)
                await loadData()
            }
        } onTap: {
            editing = task
        }
    }

    private func load() async {
        await loadData()
        do {
            let ctx = try session.requireContext()
            let period = weekPeriod(for: Date())
            review = try await ReviewRepository(ctx).review(type: .weekly, periodStart: period.start)
            notes = review?.notes ?? ""
            // Resume at the first unchecked step.
            if let review {
                step = Self.steps.firstIndex { review.checklist[$0.key] != true } ?? 0
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func loadData() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx).tasks()
            async let projectsLoad = ProjectRepository(ctx).projects()
            tasks = try await tasksLoad
            projects = try await projectsLoad
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func completeStep() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let repo = ReviewRepository(ctx)
            let period = weekPeriod(for: Date())
            var current = review
            if current == nil {
                current = try await repo.start(type: .weekly, period: period)
            }
            guard let id = current?.id else { return }

            var patch = ReviewPatch()
            var updated = current?.checklist ?? [:]
            updated[Self.steps[step].key] = true
            patch.checklist = updated
            patch.notes = notes
            if step == Self.steps.count - 1 {
                patch.completedAt = Date()
            }
            review = try await repo.update(id: id, patch: patch)
            if step < Self.steps.count - 1 {
                step += 1
            } else {
                finished = true
                await onFinish()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
