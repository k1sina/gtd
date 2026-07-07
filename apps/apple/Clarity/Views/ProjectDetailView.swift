import ClarityCore
import ClarityKit
import SwiftUI

struct ProjectDetailView: View {
    let project: Project

    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var newTaskText = ""
    @State private var editing: TaskItem?
    @State private var error: String?

    private var open: [TaskItem] {
        tasks
            .filter { $0.status != .done && $0.status != .cancelled }
            .sorted { priorityScore($0) > priorityScore($1) }
    }

    private var done: [TaskItem] {
        tasks.filter { $0.status == .done }
    }

    var body: some View {
        List {
            if let outcome = project.outcome, !outcome.isEmpty {
                Section("Outcome") {
                    Text(outcome).foregroundStyle(.secondary)
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
                    TaskRowView(task: task) {
                        Task { await complete(task) }
                    } onTap: {
                        editing = task
                    }
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
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            tasks = try await TaskRepository(ctx).tasks().filter { $0.projectId == project.id }
            projects = try await ProjectRepository(ctx).projects()
            error = nil
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
