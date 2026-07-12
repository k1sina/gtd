import ClarityCore
import ClarityKit
import SwiftUI

/// Someday/maybe: ideas parked for later — rescanned during the weekly
/// review. Mirrors the web someday page.
struct SomedayView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var subtaskCounts: [UUID: (done: Int, total: Int)] = [:]
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?
    @State private var tagFilter: String?
    @State private var energyFilter: Energy?

    private var allTags: [String] {
        Array(Set(tasks.flatMap(\.contextTags))).sorted()
    }

    private var filtered: [TaskItem] {
        tasks.filter { task in
            (tagFilter == nil || task.contextTags.contains(tagFilter!))
                && (energyFilter == nil || task.energy == energyFilter)
        }
    }

    private var filtersActive: Bool {
        tagFilter != nil || energyFilter != nil
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if !allTags.isEmpty || tasks.contains(where: { $0.energy != nil }) {
                Section {
                    TaskFilterChips(
                        storageKey: "clarity.filters.someday",
                        allTags: allTags,
                        showEnergy: tasks.contains(where: { $0.energy != nil }),
                        tagFilter: $tagFilter,
                        energyFilter: $energyFilter)
                }
            }
            Section {
                if tasks.isEmpty && !loading {
                    Text("Nothing parked — capture with \"!someday\" or file inbox items here.")
                        .foregroundStyle(.secondary)
                } else if filtered.isEmpty && !loading {
                    Text("Nothing matches the filters.").foregroundStyle(.secondary)
                }
                ForEach(filtered) { task in
                    TaskRowView(task: task, subtaskStats: subtaskCounts[task.id]) {
                        Task { await complete(task) }
                    } onTap: {
                        editing = task
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button("Activate") {
                            Task { await activate(task) }
                        }
                        .tint(.blue)
                    }
                    .swipeActions(edge: .trailing) {
                        Button("Delete", role: .destructive) {
                            Task { await remove(task) }
                        }
                    }
                }
                // Reordering a filtered subset would scramble hidden rows.
                .onMove(perform: filtersActive ? nil : moveRows)
            } footer: {
                if !tasks.isEmpty {
                    Text("Swipe right to make something a next action. Drag to reorder.")
                }
            }
        }
        .navigationTitle("Someday/maybe")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if tasks.count > 1 && !filtersActive { EditButton() }
            }
        }
        #endif
        .sheet(item: $editing) { task in
            TaskEditView(task: task) { await load() }
        }
    }

    private func moveRows(from source: IndexSet, to destination: Int) {
        guard let first = source.first else { return }
        let target = destination > first ? destination - 1 : destination
        let patches = reorderPatches(tasks, from: first, to: target)
        guard !patches.isEmpty else { return }
        tasks.move(fromOffsets: source, toOffset: destination)
        Task {
            do {
                let ctx = try session.requireContext()
                try await TaskRepository(ctx).reorder(patches)
            } catch {
                self.error = error.localizedDescription
            }
            await load()
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx).tasks(statuses: [.someday])
            tasks = try await tasksLoad.sorted(by: userOrder())
            subtaskCounts = try await TaskRepository(ctx).subtaskCounts(for: tasks.map(\.id))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func activate(_ task: TaskItem) async {
        do {
            let ctx = try session.requireContext()
            var patch = TaskPatch()
            patch.status = .next
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
