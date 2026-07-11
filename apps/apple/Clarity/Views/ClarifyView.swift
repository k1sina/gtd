import ClarityCore
import ClarityKit
import SwiftUI

/// GTD clarify flow: walk through inbox items one at a time and decide what
/// each one is — mirrors the web ClarifyCard. The queue shrinks as items get
/// clarified.
struct ClarifyView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var queue: [TaskItem] = []
    @State private var clarified = 0
    @State private var loading = true
    @State private var error: String?

    // Per-card state, reset when the card advances.
    @State private var hasDue = false
    @State private var dueAt = Date()
    @State private var urgency = 2
    @State private var importance = 2
    @State private var priorityExpanded = false
    @State private var askWaiting = false
    @State private var waitingOn = ""

    private var current: TaskItem? { queue.first }

    var body: some View {
        NavigationStack {
            Group {
                if let task = current {
                    card(task)
                } else if loading {
                    ProgressView()
                } else {
                    inboxZero
                }
            }
            .navigationTitle("Clarify")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task { await load() }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 480)
        #endif
    }

    private var inboxZero: some View {
        ContentUnavailableView {
            Label("Inbox zero", systemImage: "checkmark.seal")
        } description: {
            Text(clarified > 0
                ? "All \(clarified) item\(clarified == 1 ? "" : "s") clarified — nice."
                : "Nothing to clarify.")
        } actions: {
            Button("Done") { dismiss() }
        }
    }

    private func card(_ task: TaskItem) -> some View {
        Form {
            Section {
                Text(task.title).font(.headline)
                if let notes = task.notes, !notes.isEmpty {
                    Text(notes).font(.subheadline).foregroundStyle(.secondary)
                }
                if queue.count > 1 {
                    Text("\(queue.count) items left")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Section {
                Toggle("Due date", isOn: $hasDue)
                if hasDue {
                    DatePicker("Due", selection: $dueAt)
                }
            }
            Section {
                // Collapsed unless the item was deliberately rated already.
                DisclosureGroup(isExpanded: $priorityExpanded) {
                    Stepper("Urgency: \(urgency)", value: $urgency, in: 1...4)
                    Stepper("Importance: \(importance)", value: $importance, in: 1...4)
                } label: {
                    LabeledContent("Priority") {
                        if isRatedPriority(urgency: urgency, importance: importance) {
                            Label(
                                quadrant(urgency: urgency, importance: importance).label,
                                systemImage: "circle.fill")
                            .foregroundStyle(
                                quadrant(urgency: urgency, importance: importance).color)
                        } else {
                            Text("Not rated")
                        }
                    }
                }
            }
            if askWaiting {
                Section("Waiting on whom / what?") {
                    TextField("e.g. Sara — contract draft", text: $waitingOn)
                        .onSubmit { Task { await file(task, status: .waiting) } }
                    HStack {
                        Button("Save") { Task { await file(task, status: .waiting) } }
                            .buttonStyle(.borderedProminent)
                            .disabled(waitingOn.trimmingCharacters(in: .whitespaces).isEmpty)
                        Button("Cancel") { askWaiting = false }
                    }
                }
            } else {
                Section {
                    Button {
                        Task { await file(task, status: .done) }
                    } label: {
                        Label("Did it (2-min rule)", systemImage: "bolt.fill")
                    }
                    Button {
                        Task { await file(task, status: hasDue ? .scheduled : .next) }
                    } label: {
                        Label(hasDue ? "Schedule" : "Next action",
                              systemImage: hasDue ? "calendar" : "arrow.right.circle")
                    }
                    Button {
                        askWaiting = true
                    } label: {
                        Label("Waiting for…", systemImage: "hourglass")
                    }
                    Button {
                        Task { await file(task, status: .someday) }
                    } label: {
                        Label("Someday", systemImage: "moon.zzz")
                    }
                    Button {
                        Task { await makeProject(task) }
                    } label: {
                        Label("It's a project", systemImage: "folder.badge.plus")
                    }
                    Button(role: .destructive) {
                        Task { await trash(task) }
                    } label: {
                        Label("Trash", systemImage: "trash")
                    }
                } footer: {
                    Text("Is it actionable? Under 2 minutes → do it now. Multiple steps → it's a project. Not yours → waiting for. Not now → someday.")
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
        }
        .formStyle(.grouped)
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            // Oldest first — same order the web clarify flow walks.
            queue = try await TaskRepository(ctx).tasks(statuses: [.inbox])
                .sorted { $0.createdAt < $1.createdAt }
            resetCardState()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func resetCardState() {
        hasDue = false
        dueAt = Date()
        urgency = current?.urgency ?? 2
        importance = current?.importance ?? 2
        priorityExpanded = isRatedPriority(urgency: urgency, importance: importance)
        askWaiting = false
        waitingOn = ""
    }

    private func advance() {
        if !queue.isEmpty { queue.removeFirst() }
        clarified += 1
        resetCardState()
    }

    /// Apply the chosen status plus whatever due/priority the user set on
    /// the card — mirrors the web card's `base` patch.
    private func file(_ task: TaskItem, status: TaskStatus) async {
        var patch = TaskPatch()
        patch.status = status
        patch.urgency = urgency
        patch.importance = importance
        if hasDue { patch.dueAt = dueAt }
        switch status {
        case .done:
            patch.completedAt = Date()
        case .waiting:
            let waiting = waitingOn.trimmingCharacters(in: .whitespaces)
            guard !waiting.isEmpty else { return }
            patch.waitingOn = waiting
        default:
            break
        }
        do {
            let ctx = try session.requireContext()
            _ = try await TaskRepository(ctx).update(id: task.id, patch: patch)
            advance()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Turn the capture into a project: the item itself becomes the parent
    /// (a task with subtasks IS a project) and gets a "define first next
    /// action" seed subtask — exactly like the web card.
    private func makeProject(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            var patch = TaskPatch()
            patch.status = .next
            if let notes = task.notes, !notes.isEmpty { patch.outcome = notes }
            _ = try await TaskRepository(ctx).update(id: task.id, patch: patch)
            _ = try await TaskRepository(ctx).create(NewTaskPayload(
                spaceId: ctx.spaceId, createdBy: ctx.userId,
                title: "Define first next action for “\(task.title)”",
                status: .next, parentTaskId: task.id))
            advance()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func trash(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).delete(id: task.id)
            advance()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
