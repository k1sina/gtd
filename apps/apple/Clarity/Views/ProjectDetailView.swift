import ClarityCore
import ClarityKit
import SwiftUI

/// Project detail: editable name/outcome, status, area, delete, stalled
/// warning, and the task list with subtasks indented — mirrors the web
/// project page.
struct ProjectDetailView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var project: Project
    @State private var name: String
    @State private var outcome: String
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var areas: [Area] = []
    @State private var newTaskText = ""
    @State private var editing: TaskItem?
    @State private var confirmingDelete = false
    @State private var error: String?

    init(project: Project) {
        _project = State(initialValue: project)
        _name = State(initialValue: project.name)
        _outcome = State(initialValue: project.outcome ?? "")
    }

    private var topLevel: [TaskItem] {
        tasks.filter { $0.parentTaskId == nil }
    }

    private var open: [TaskItem] {
        topLevel
            .filter { $0.status != .done && $0.status != .cancelled }
            .sorted { priorityScore($0) > priorityScore($1) }
    }

    private var done: [TaskItem] {
        topLevel
            .filter { $0.status == .done }
            .sorted { ($0.completedAt ?? .distantPast) > ($1.completedAt ?? .distantPast) }
    }

    private var hasNextAction: Bool {
        open.contains { $0.status == .next }
    }

    private func children(of task: TaskItem) -> [TaskItem] {
        tasks.filter { $0.parentTaskId == task.id }
    }

    var body: some View {
        List {
            Section {
                TextField("Project name", text: $name)
                    .font(.headline)
                    .onSubmit { Task { await saveHeader() } }
                TextField("Desired outcome — what does done look like?", text: $outcome, axis: .vertical)
                    .lineLimit(1...4)
                    .foregroundStyle(.secondary)
                    .onSubmit { Task { await saveHeader() } }
                Picker("Status", selection: statusBinding) {
                    ForEach(ProjectStatus.allCases, id: \.self) { status in
                        Text(status.label).tag(status)
                    }
                }
                Picker("Area", selection: areaBinding) {
                    Text("No area").tag(UUID?.none)
                    ForEach(areas) { area in
                        Text(area.name).tag(UUID?.some(area.id))
                    }
                }
            }
            if !hasNextAction && project.status == .active {
                Section {
                    Label(
                        "This project has no next action — every active project needs one.",
                        systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                }
            }
            Section {
                QuickAddField(text: $newTaskText, placeholder: "Add a task to this project…") {
                    Task { await addTask() }
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section("Open") {
                if open.isEmpty {
                    Text("No open tasks — add a next action.").foregroundStyle(.secondary)
                }
                ForEach(open) { task in
                    taskRows(task)
                }
            }
            if !done.isEmpty {
                Section("Done") {
                    ForEach(done) { task in
                        Text(task.title).strikethrough().foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(project.name)
        .toolbar {
            ToolbarItem(placement: .destructiveAction) {
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Label("Delete project", systemImage: "trash")
                }
            }
        }
        .confirmationDialog(
            "Delete this project and all its tasks?",
            isPresented: $confirmingDelete, titleVisibility: .visible
        ) {
            Button("Delete project", role: .destructive) {
                Task { await deleteProject() }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    /// The task row plus its subtasks, indented — same presentation as the
    /// web project task list.
    @ViewBuilder
    private func taskRows(_ task: TaskItem) -> some View {
        let subtasks = children(of: task)
        let doneCount = subtasks.filter { $0.status == .done }.count
        TaskRowView(
            task: task,
            subtaskStats: subtasks.isEmpty ? nil : (doneCount, subtasks.count)
        ) {
            Task { await complete(task) }
        } onTap: {
            editing = task
        }
        ForEach(subtasks.filter { $0.status != .done && $0.status != .cancelled }) { subtask in
            TaskRowView(task: subtask) {
                Task { await complete(subtask) }
            } onTap: {
                editing = subtask
            }
            .padding(.leading, 28)
        }
    }

    private var statusBinding: Binding<ProjectStatus> {
        Binding(
            get: { project.status },
            set: { newStatus in
                Task { await changeStatus(to: newStatus) }
            })
    }

    private var areaBinding: Binding<UUID?> {
        Binding(
            get: { project.areaId },
            set: { newArea in
                Task { await changeArea(to: newArea) }
            })
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx).tasks(topLevelOnly: false)
            async let projectsLoad = ProjectRepository(ctx).projects()
            async let areasLoad = AreaRepository(ctx).areas()
            tasks = try await tasksLoad.filter { $0.projectId == project.id }
            projects = try await projectsLoad
            areas = try await areasLoad
            if let fresh = projects.first(where: { $0.id == project.id }) {
                project = fresh
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func saveHeader() async {
        var patch = ProjectPatch()
        var changed = false
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        if !trimmedName.isEmpty && trimmedName != project.name {
            patch.name = trimmedName
            changed = true
        }
        let trimmedOutcome = outcome.trimmingCharacters(in: .whitespaces)
        if trimmedOutcome != (project.outcome ?? "") {
            if trimmedOutcome.isEmpty { patch.clearOutcome = true }
            else { patch.outcome = trimmedOutcome }
            changed = true
        }
        // Submitting without edits would send an empty PATCH — skip it.
        guard changed else { return }
        await apply(patch)
    }

    /// Moving to completed stamps completed_at; anything else clears it —
    /// same as the web status selector.
    private func changeStatus(to status: ProjectStatus) async {
        var patch = ProjectPatch()
        patch.status = status
        if status == .completed { patch.completedAt = Date() }
        else { patch.clearCompletedAt = true }
        await apply(patch)
    }

    private func changeArea(to areaId: UUID?) async {
        var patch = ProjectPatch()
        if let areaId { patch.areaId = areaId } else { patch.clearAreaId = true }
        await apply(patch)
    }

    private func apply(_ patch: ProjectPatch) async {
        do {
            let ctx = try session.requireContext()
            project = try await ProjectRepository(ctx).update(id: project.id, patch: patch)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteProject() async {
        do {
            let ctx = try session.requireContext()
            try await ProjectRepository(ctx).delete(id: project.id)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func addTask() async {
        let text = newTaskText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        newTaskText = ""
        do {
            let ctx = try session.requireContext()
            let parsed = parseQuickAdd(text)
            var payload = NewTaskPayload(
                parsed: parsed, spaceId: ctx.spaceId, createdBy: ctx.userId, projects: projects)
            payload.projectId = project.id
            payload.status = parsed.someday ? .someday : .next
            _ = try await TaskRepository(ctx).create(payload)
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
