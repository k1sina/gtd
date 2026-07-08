import ClarityCore
import ClarityKit
import SwiftUI
import UniformTypeIdentifiers

/// Eisenhower priority matrix: four quadrants, move tasks between them to
/// re-prioritise — mirrors the web matrix page. Drag-and-drop works on
/// macOS/iPadOS; a context-menu "Move to…" covers iPhone (and is available
/// everywhere).
struct MatrixView: View {
    @Environment(AppSession.self) private var session
    @State private var tasks: [TaskItem] = []
    @State private var projects: [Project] = []
    @State private var editing: TaskItem?
    @State private var error: String?

    private static let quadrants: [Quadrant] = [.doFirst, .schedule, .delegate, .eliminate]

    /// Same population as the web matrix: open, top-level, not deferred.
    private var candidates: [TaskItem] {
        let now = Date()
        return tasks
            .filter { !isDeferred($0, now: now) }
            .sorted { priorityScore($0, now: now) > priorityScore($1, now: now) }
    }

    private func tasks(in quadrant: Quadrant) -> [TaskItem] {
        candidates.filter { $0.quadrant == quadrant }
    }

    var body: some View {
        ScrollView {
            if let error {
                Text(error).foregroundStyle(.red).font(.footnote).padding(.horizontal)
            }
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    quadrantCell(.doFirst)
                    quadrantCell(.schedule)
                }
                GridRow {
                    quadrantCell(.delegate)
                    quadrantCell(.eliminate)
                }
            }
            .padding()
        }
        .navigationTitle("Priority matrix")
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        .sheet(item: $editing) { task in
            TaskEditView(task: task, projects: projects) { await load() }
        }
    }

    private func quadrantCell(_ quadrant: Quadrant) -> some View {
        let items = tasks(in: quadrant)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(quadrant.label)
                    .font(.subheadline.bold())
                    .foregroundStyle(quadrant.color)
                Spacer()
                Text("\(items.count)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Text(quadrant.hint)
                .font(.caption2)
                .foregroundStyle(.secondary)
            ForEach(items) { task in
                matrixRow(task)
            }
            if items.isEmpty {
                Text("Drop tasks here")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 12)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 180, alignment: .top)
        .background(quadrant.color.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(quadrant.color.opacity(0.25)))
        .dropDestination(for: String.self) { ids, _ in
            guard let id = ids.first.flatMap(UUID.init(uuidString:)) else { return false }
            Task { await move(taskId: id, to: quadrant) }
            return true
        }
    }

    private func matrixRow(_ task: TaskItem) -> some View {
        HStack(spacing: 8) {
            Button {
                Task { await complete(task) }
            } label: {
                Image(systemName: "circle").foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 1) {
                Text(task.title).font(.callout).lineLimit(2)
                if let due = task.dueAt {
                    Text(due, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(due < .now ? .red : .secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        .onTapGesture { editing = task }
        .draggable(task.id.uuidString)
        .contextMenu {
            ForEach(Self.quadrants.filter { $0 != task.quadrant }, id: \.self) { quadrant in
                Button("Move to \(quadrant.label)") {
                    Task { await move(taskId: task.id, to: quadrant) }
                }
            }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let tasksLoad = TaskRepository(ctx)
                .tasks(statuses: [.inbox, .next, .scheduled, .waiting])
            async let projectsLoad = ProjectRepository(ctx).projects()
            tasks = try await tasksLoad
            projects = try await projectsLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Writes the quadrant's representative urgency/importance — same values
    /// as the web page; skips when the task is already there.
    private func move(taskId: UUID, to quadrant: Quadrant) async {
        guard let task = tasks.first(where: { $0.id == taskId }),
              task.quadrant != quadrant else { return }
        let values = quadrant.representativeValues
        var patch = TaskPatch()
        patch.urgency = values.urgency
        patch.importance = values.importance
        do {
            let ctx = try session.requireContext()
            _ = try await TaskRepository(ctx).update(id: taskId, patch: patch)
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
