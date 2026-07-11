import ClarityCore
import ClarityKit
import SwiftUI

/// Next actions, highest leverage first. Deferred tasks are hidden until
/// their defer date (they live on the Scheduled view) — same as the web.
struct NextView: View {
    @Environment(AppSession.self) private var session
    /// Every task in the space (subtasks included) — needed for the surfaced
    /// next action and stalled detection on parents.
    @State private var allTasks: [TaskItem] = []
    @State private var subtaskCounts: [UUID: (done: Int, total: Int)] = [:]
    @State private var editing: TaskItem?
    @State private var loading = true
    @State private var error: String?
    @State private var tagFilter: String?
    @State private var energyFilter: Energy?

    private var ranked: [TaskItem] {
        let now = Date()
        return allTasks
            .filter { $0.parentTaskId == nil && $0.status == .next && !isDeferred($0, now: now) }
            .sorted { priorityScore($0, now: now) > priorityScore($1, now: now) }
    }

    private var allTags: [String] {
        Array(Set(ranked.flatMap(\.contextTags))).sorted()
    }

    private var filtered: [TaskItem] {
        ranked.filter { task in
            (tagFilter == nil || task.contextTags.contains(tagFilter!))
                && (energyFilter == nil || task.energy == energyFilter)
        }
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if !allTags.isEmpty || ranked.contains(where: { $0.energy != nil }) {
                Section {
                    filterChips
                }
            }
            Section {
                if ranked.isEmpty && !loading {
                    Text("No next actions — clarify your inbox or check your projects.")
                        .foregroundStyle(.secondary)
                } else if filtered.isEmpty && !loading {
                    Text("Nothing matches the filters.").foregroundStyle(.secondary)
                }
                ForEach(filtered) { task in
                    let action = firstActionableSubtask(of: task.id, in: allTasks)
                    TaskRowView(
                        task: task,
                        subtaskStats: subtaskCounts[task.id],
                        actionSubtask: action,
                        stalled: isStalledParent(task, in: allTasks)
                    ) {
                        Task { await complete(action ?? task) }
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
        .navigationTitle("Next actions")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { SpaceSwitcherMenu() }
        }
        #endif
        .sheet(item: $editing) { task in
            TaskEditView(task: task) { await load() }
        }
    }

    /// Context-tag and energy filter chips — mirrors the web next page.
    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(allTags, id: \.self) { tag in
                    chip("@\(tag)", selected: tagFilter == tag) {
                        tagFilter = tagFilter == tag ? nil : tag
                    }
                }
                if !allTags.isEmpty {
                    Divider().frame(height: 16)
                }
                ForEach(Energy.allCases, id: \.self) { energy in
                    chip("\(energy.rawValue) energy", selected: energyFilter == energy) {
                        energyFilter = energyFilter == energy ? nil : energy
                    }
                }
            }
        }
        .listRowBackground(Color.clear)
    }

    private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    selected ? Color.indigo.opacity(0.18) : Color.secondary.opacity(0.08),
                    in: Capsule())
                .foregroundStyle(selected ? Color.indigo : Color.secondary)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            allTasks = try await TaskRepository(ctx).tasks(topLevelOnly: false)
            subtaskCounts = TaskRepository.aggregateSubtaskCounts(
                allTasks.map { ($0.parentTaskId, $0.status) })
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
