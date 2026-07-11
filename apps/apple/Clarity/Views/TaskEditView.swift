import ClarityCore
import ClarityKit
import SwiftUI

/// Edit sheet for one task. Saves a TaskPatch; clears due/defer/recurrence
/// with explicit nulls when toggled off.
struct TaskEditView: View {
    let task: TaskItem
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var notes: String
    @State private var outcome: String
    @State private var status: TaskStatus
    @State private var urgency: Int
    @State private var importance: Int
    @State private var priorityExpanded: Bool
    @State private var hasDue: Bool
    @State private var dueAt: Date
    @State private var hasDefer: Bool
    @State private var deferUntil: Date
    @State private var estimateText: String
    @State private var energy: Energy?
    @State private var tagsText: String
    @State private var waitingOn: String
    @State private var recurrence: String?
    @State private var subtasks: [TaskItem] = []
    @State private var newSubtask = ""
    @State private var members: [SpaceMemberInfo] = []
    @State private var assignedTo: UUID?
    @State private var busy = false
    @State private var error: String?

    private static let recurrencePresets: [(label: String, rule: String)] = [
        ("Every day", "FREQ=DAILY;INTERVAL=1"),
        ("Every weekday", "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"),
        ("Every week", "FREQ=WEEKLY;INTERVAL=1"),
        ("Every 2 weeks", "FREQ=WEEKLY;INTERVAL=2"),
        ("Every month", "FREQ=MONTHLY;INTERVAL=1"),
        ("Every year", "FREQ=YEARLY;INTERVAL=1"),
    ]

    init(task: TaskItem, onSave: @escaping () async -> Void) {
        self.task = task
        self.onSave = onSave
        _title = State(initialValue: task.title)
        _notes = State(initialValue: task.notes ?? "")
        _outcome = State(initialValue: task.outcome ?? "")
        _status = State(initialValue: task.status)
        _urgency = State(initialValue: task.urgency)
        _importance = State(initialValue: task.importance)
        // Collapsed unless the task was deliberately rated (≠ the 2,2 default).
        _priorityExpanded = State(
            initialValue: isRatedPriority(urgency: task.urgency, importance: task.importance))
        _hasDue = State(initialValue: task.dueAt != nil)
        _dueAt = State(initialValue: task.dueAt ?? .now)
        _hasDefer = State(initialValue: task.deferUntil != nil)
        _deferUntil = State(initialValue: task.deferUntil ?? .now)
        _estimateText = State(initialValue: task.estimatedMinutes.map(String.init) ?? "")
        _energy = State(initialValue: task.energy)
        _tagsText = State(initialValue: task.contextTags.joined(separator: ", "))
        _waitingOn = State(initialValue: task.waitingOn ?? "")
        _recurrence = State(initialValue: task.recurrenceRule)
        _assignedTo = State(initialValue: task.assignedTo)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(2...6)
                }
                Section {
                    Picker("Status", selection: $status) {
                        ForEach(TaskStatus.allCases, id: \.self) { status in
                            Text(status.rawValue.capitalized).tag(status)
                        }
                    }
                    if status == .waiting {
                        TextField("Waiting on", text: $waitingOn)
                    }
                    if session.currentSpace?.isPersonal == false && !members.isEmpty {
                        Picker("Assignee", selection: $assignedTo) {
                            Text("Unassigned").tag(UUID?.none)
                            ForEach(members) { member in
                                Text(member.profile.displayName.isEmpty
                                    ? member.profile.email : member.profile.displayName)
                                    .tag(UUID?.some(member.userId))
                            }
                        }
                    }
                }
                Section {
                    DisclosureGroup(isExpanded: $priorityExpanded) {
                        PriorityMatrixView(urgency: $urgency, importance: $importance)
                            .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    } label: {
                        LabeledContent("Priority") {
                            if isRatedPriority(urgency: urgency, importance: importance) {
                                Label(
                                    quadrant(urgency: urgency, importance: importance).label,
                                    systemImage: "circle.fill"
                                )
                                .foregroundStyle(
                                    quadrant(urgency: urgency, importance: importance).color)
                            } else {
                                Text("Not rated")
                            }
                        }
                    }
                }
                Section("Schedule") {
                    Toggle("Due date", isOn: $hasDue)
                    if hasDue {
                        DatePicker("Due", selection: $dueAt)
                    }
                    Toggle("Defer", isOn: $hasDefer)
                    if hasDefer {
                        DatePicker("Until", selection: $deferUntil)
                    }
                    Picker("Repeat", selection: $recurrence) {
                        Text("Never").tag(String?.none)
                        ForEach(Self.recurrencePresets, id: \.rule) { preset in
                            Text(preset.label).tag(String?.some(preset.rule))
                        }
                        if let current = recurrence,
                            !Self.recurrencePresets.contains(where: { $0.rule == current })
                        {
                            Text(describeRule(current)).tag(String?.some(current))
                        }
                    }
                }
                Section("Details") {
                    TextField("Estimate (minutes)", text: $estimateText)
                    Picker("Energy", selection: $energy) {
                        Text("Any").tag(Energy?.none)
                        ForEach(Energy.allCases, id: \.self) { energy in
                            Text(energy.rawValue.capitalized).tag(Energy?.some(energy))
                        }
                    }
                    TextField("Tags (comma separated)", text: $tagsText)
                }
                subtasksSection
                CommentsSection(task: task)
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            // macOS falls back to the misaligned "columns" style without this;
            // on iOS grouped is already the default.
            .formStyle(.grouped)
            .task {
                await loadSubtasks()
                await loadMembers()
            }
            .navigationTitle("Edit task")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 440, minHeight: 520)
        #endif
    }

    /// Checklist-style sub-tasks — mirrors the subtasks block in the web
    /// task detail dialog. Any task can hold them (a task with subtasks IS a
    /// project), so the section also carries the GTD outcome line.
    private var subtasksSection: some View {
        Section {
            if !subtasks.isEmpty || !outcome.isEmpty {
                TextField("Outcome — what does done look like?", text: $outcome)
            }
            ForEach(subtasks) { subtask in
                HStack(spacing: 10) {
                    Button {
                        Task { await toggleSubtask(subtask) }
                    } label: {
                        Image(systemName: subtask.status == .done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(subtask.status == .done ? Color.green : Color.secondary)
                    }
                    .buttonStyle(.plain)
                    Text(subtask.title)
                        .strikethrough(subtask.status == .done)
                        .foregroundStyle(subtask.status == .done ? .secondary : .primary)
                }
            }
            // The order decides which subtask surfaces as the parent's next
            // action, so reordering here is meaningful, not cosmetic.
            .onMove(perform: moveSubtasks)
            HStack {
                Image(systemName: "plus.circle").foregroundStyle(.secondary)
                TextField("Add a subtask…", text: $newSubtask)
                    .textFieldStyle(.plain)
                    .onSubmit { Task { await addSubtask() } }
            }
        } header: {
            HStack {
                Text("Subtasks")
                #if os(iOS)
                if subtasks.count > 1 {
                    Spacer()
                    EditButton().font(.footnote)
                }
                #endif
            }
        }
    }

    private func moveSubtasks(from source: IndexSet, to destination: Int) {
        guard let first = source.first else { return }
        let target = destination > first ? destination - 1 : destination
        let patches = reorderPatches(subtasks, from: first, to: target)
        guard !patches.isEmpty else { return }
        subtasks.move(fromOffsets: source, toOffset: destination)
        Task {
            do {
                let ctx = try session.requireContext()
                try await TaskRepository(ctx).reorder(patches)
            } catch {
                self.error = error.localizedDescription
            }
            await loadSubtasks()
        }
    }

    private func loadMembers() async {
        guard session.currentSpace?.isPersonal == false,
              let ctx = try? session.requireContext() else { return }
        members = (try? await SpaceRepository(ctx).members()) ?? []
    }

    private func loadSubtasks() async {
        guard let ctx = try? session.requireContext() else { return }
        subtasks = (try? await TaskRepository(ctx).subtasks(of: task.id)) ?? []
    }

    private func addSubtask() async {
        let text = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        newSubtask = ""
        do {
            let ctx = try session.requireContext()
            // Append below the existing subtasks (matches the web dialog).
            _ = try await TaskRepository(ctx).create(NewTaskPayload(
                spaceId: ctx.spaceId, createdBy: ctx.userId, title: text,
                status: .next, parentTaskId: task.id,
                sortOrder: Double(subtasks.count)))
            await loadSubtasks()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func toggleSubtask(_ subtask: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).complete(subtask, done: subtask.status != .done)
            await loadSubtasks()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        var patch = TaskPatch()
        patch.title = title.trimmingCharacters(in: .whitespaces)
        patch.notes = notes
        let trimmedOutcome = outcome.trimmingCharacters(in: .whitespaces)
        if trimmedOutcome.isEmpty { patch.clearOutcome = true } else {
            patch.outcome = trimmedOutcome
        }
        patch.status = status
        patch.urgency = urgency
        patch.importance = importance
        if hasDue { patch.dueAt = dueAt } else { patch.clearDueAt = true }
        if hasDefer { patch.deferUntil = deferUntil } else { patch.clearDeferUntil = true }
        if let minutes = Int(estimateText.trimmingCharacters(in: .whitespaces)), minutes > 0 {
            patch.estimatedMinutes = minutes
        } else {
            patch.clearEstimatedMinutes = true
        }
        if let energy { patch.energy = energy } else { patch.clearEnergy = true }
        patch.contextTags = tagsText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }
        let waiting = waitingOn.trimmingCharacters(in: .whitespaces)
        if status == .waiting && !waiting.isEmpty {
            patch.waitingOn = waiting
        } else {
            patch.clearWaitingOn = true
        }
        if let recurrence { patch.recurrenceRule = recurrence } else {
            patch.clearRecurrenceRule = true
        }
        if session.currentSpace?.isPersonal == false {
            if let assignedTo { patch.assignedTo = assignedTo }
            else { patch.clearAssignedTo = true }
        }

        do {
            let ctx = try session.requireContext()
            _ = try await TaskRepository(ctx).update(id: task.id, patch: patch)
            await onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
