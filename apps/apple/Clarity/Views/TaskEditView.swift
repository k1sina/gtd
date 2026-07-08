import ClarityCore
import ClarityKit
import SwiftUI

/// Edit sheet for one task. Saves a TaskPatch; clears due/defer/recurrence
/// with explicit nulls when toggled off.
struct TaskEditView: View {
    let task: TaskItem
    let projects: [Project]
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var notes: String
    @State private var status: TaskStatus
    @State private var projectId: UUID?
    @State private var urgency: Int
    @State private var importance: Int
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

    init(task: TaskItem, projects: [Project], onSave: @escaping () async -> Void) {
        self.task = task
        self.projects = projects
        self.onSave = onSave
        _title = State(initialValue: task.title)
        _notes = State(initialValue: task.notes ?? "")
        _status = State(initialValue: task.status)
        _projectId = State(initialValue: task.projectId)
        _urgency = State(initialValue: task.urgency)
        _importance = State(initialValue: task.importance)
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
                    Picker("Project", selection: $projectId) {
                        Text("None").tag(UUID?.none)
                        ForEach(projects) { project in
                            Text(project.name).tag(UUID?.some(project.id))
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
                Section("Priority") {
                    Stepper("Urgency: \(urgency)", value: $urgency, in: 1...4)
                    Stepper("Importance: \(importance)", value: $importance, in: 1...4)
                    LabeledContent("Quadrant") {
                        Label(
                            quadrant(urgency: urgency, importance: importance).label,
                            systemImage: "circle.fill"
                        )
                        .foregroundStyle(quadrant(urgency: urgency, importance: importance).color)
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
                if task.parentTaskId == nil {
                    subtasksSection
                }
                CommentsSection(task: task)
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
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
    /// task detail dialog.
    private var subtasksSection: some View {
        Section("Subtasks") {
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
            HStack {
                Image(systemName: "plus.circle").foregroundStyle(.secondary)
                TextField("Add a subtask…", text: $newSubtask)
                    .textFieldStyle(.plain)
                    .onSubmit { Task { await addSubtask() } }
            }
        }
    }

    private func loadMembers() async {
        guard session.currentSpace?.isPersonal == false,
              let ctx = try? session.requireContext() else { return }
        members = (try? await SpaceRepository(ctx).members()) ?? []
    }

    private func loadSubtasks() async {
        guard task.parentTaskId == nil,
              let ctx = try? session.requireContext() else { return }
        subtasks = (try? await TaskRepository(ctx).subtasks(of: task.id)) ?? []
    }

    private func addSubtask() async {
        let text = newSubtask.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        newSubtask = ""
        do {
            let ctx = try session.requireContext()
            _ = try await TaskRepository(ctx).create(NewTaskPayload(
                spaceId: ctx.spaceId, createdBy: ctx.userId, title: text,
                status: .next, projectId: task.projectId, parentTaskId: task.id))
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
        patch.status = status
        if let projectId { patch.projectId = projectId } else { patch.clearProjectId = true }
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
