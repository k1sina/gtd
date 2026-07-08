import ClarityCore
import ClarityKit
import SwiftUI

/// Inbox: raw captures waiting to be clarified. Swipe to file them.
struct InboxView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var captureText = ""
    @State private var editing: TaskItem?
    @State private var clarifying = false
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        List {
            Section {
                QuickAddField(text: $captureText) { Task { await capture() } }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                if tasks.isEmpty && !loading {
                    Text("Inbox zero — nice.").foregroundStyle(.secondary)
                }
                ForEach(tasks) { task in
                    TaskRowView(task: task) {
                        Task { await complete(task) }
                    } onTap: {
                        editing = task
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button("Delete", role: .destructive) {
                            Task { await remove(task) }
                        }
                        Button("Someday") {
                            Task { await move(task, to: .someday) }
                        }
                        .tint(.purple)
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button("Next") {
                            Task { await move(task, to: .next) }
                        }
                        .tint(.blue)
                    }
                }
            } footer: {
                Text("Swipe right for Next, left for Someday or Delete; tap to edit.")
            }
        }
        .navigationTitle("Inbox")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    clarifying = true
                } label: {
                    Label("Clarify", systemImage: "wand.and.stars")
                }
                .disabled(tasks.isEmpty)
            }
            #if os(iOS)
            ToolbarItem(placement: .topBarTrailing) { SpaceSwitcherMenu() }
            #endif
        }
        .sheet(isPresented: $clarifying, onDismiss: { Task { await load() } }) {
            ClarifyView()
        }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            tasks = try await TaskRepository(ctx).tasks(statuses: [.inbox])
                .sorted { $0.createdAt > $1.createdAt }
            projects = try await ProjectRepository(ctx).projects()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
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

    private func move(_ task: TaskItem, to status: TaskStatus) async {
        do {
            let ctx = try session.requireContext()
            var patch = TaskPatch()
            patch.status = status
            _ = try await TaskRepository(ctx).update(id: task.id, patch: patch)
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

    private func remove(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).delete(id: task.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
