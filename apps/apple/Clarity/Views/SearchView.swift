import ClarityCore
import ClarityKit
import SwiftUI

/// Full-text task search over title + notes (Postgres tsvector) — mirrors
/// the web search page.
struct SearchView: View {
    @Environment(AppSession.self) private var session
    @State private var query = ""
    @State private var results: [TaskItem] = []
    @State private var subtaskCounts: [UUID: (done: Int, total: Int)] = [:]
    @State private var editing: TaskItem?
    @State private var searching = false
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if query.trimmingCharacters(in: .whitespaces).count < 2 {
                Section {
                    Text("Search every task by title and notes.")
                        .foregroundStyle(.secondary)
                }
            } else if results.isEmpty && !searching {
                Section {
                    Text("No matches for “\(query)”.").foregroundStyle(.secondary)
                }
            }
            ForEach(results) { task in
                TaskRowView(task: task, subtaskStats: subtaskCounts[task.id]) {
                    Task { await complete(task) }
                } onTap: {
                    editing = task
                }
            }
        }
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Search tasks…")
        .onChange(of: query) { _, newValue in
            debounceSearch(newValue)
        }
        .sheet(item: $editing) { task in
            TaskEditView(task: task) {
                await runSearch(query)
            }
        }
    }

    private func debounceSearch(_ term: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await runSearch(term)
        }
    }

    private func runSearch(_ term: String) async {
        let trimmed = term.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            results = []
            return
        }
        searching = true
        defer { searching = false }
        do {
            let ctx = try session.requireContext()
            let repo = TaskRepository(ctx)
            results = try await repo.search(trimmed)
            subtaskCounts = try await repo.subtaskCounts(for: results.map(\.id))
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }

    private func complete(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            try await TaskRepository(ctx).complete(task)
            await runSearch(query)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
