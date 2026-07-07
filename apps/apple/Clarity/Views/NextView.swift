import ClarityCore
import ClarityKit
import SwiftUI

/// Next actions, highest leverage first. Deferred tasks are dimmed.
struct NextView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?

    private var ranked: [TaskItem] {
        tasks.sorted { priorityScore($0) > priorityScore($1) }
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                if ranked.isEmpty && !loading {
                    Text("No next actions — clarify your inbox or check your projects.")
                        .foregroundStyle(.secondary)
                }
                ForEach(ranked) { task in
                    TaskRowView(task: task, dimmed: isDeferred(task)) {
                        Task { await complete(task) }
                    } onTap: {
                        editing = task
                    }
                }
            } footer: {
                if !ranked.isEmpty {
                    Text("Ranked by importance, urgency, and due date.")
                }
            }
        }
        .navigationTitle("Next")
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            tasks = try await TaskRepository(ctx).tasks(statuses: [.next])
            projects = try await ProjectRepository(ctx).projects()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
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
