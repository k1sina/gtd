import ClarityCore
import ClarityKit
import SwiftUI

/// Projects grouped by area of focus, with progress and stalled badges —
/// mirrors the web projects page.
struct ProjectsView: View {
    @Environment(AppSession.self) private var session
    @State private var summaries: [ProjectSummary] = []
    @State private var areas: [Area] = []
    @State private var creating = false
    @State private var loading = true
    @State private var error: String?

    private var active: [ProjectSummary] {
        summaries.filter { $0.project.status == .active }
    }

    private var other: [ProjectSummary] {
        summaries.filter { $0.project.status != .active }
    }

    /// Active projects grouped by area name, "No area" last — same ordering
    /// as the web page.
    private var grouped: [(area: String, projects: [ProjectSummary])] {
        var groups: [String: [ProjectSummary]] = [:]
        for summary in active {
            let name = areas.first { $0.id == summary.project.areaId }?.name ?? "No area"
            groups[name, default: []].append(summary)
        }
        return groups.sorted { a, b in
            if a.key == "No area" { return false }
            if b.key == "No area" { return true }
            return a.key.localizedCompare(b.key) == .orderedAscending
        }.map { (area: $0.key, projects: $0.value) }
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            if active.isEmpty && !loading {
                Section {
                    Text("No active projects — anything that takes more than one step deserves one.")
                        .foregroundStyle(.secondary)
                }
            }
            ForEach(grouped, id: \.area) { group in
                Section(group.area) {
                    ForEach(group.projects) { summary in row(summary) }
                }
            }
            if !other.isEmpty {
                Section("Someday, on hold & finished") {
                    ForEach(other) { summary in row(summary) }
                }
            }
        }
        .navigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    creating = true
                } label: {
                    Label("New project", systemImage: "plus")
                }
            }
        }
        .refreshable { await load() }
        .task(id: session.reloadKey) { await load() }
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(project: project)
        }
        .sheet(isPresented: $creating) {
            NewProjectSheet(areas: areas) { await load() }
        }
    }

    private func row(_ summary: ProjectSummary) -> some View {
        let total = summary.openTasks + summary.doneTasks
        let progress = total > 0 ? Double(summary.doneTasks) / Double(total) : 0
        return NavigationLink(value: summary.project) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(summary.project.name)
                    if summary.project.status != .active {
                        Text(summary.project.status.label)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.12), in: Capsule())
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if summary.stalled {
                        Text("stalled")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.2), in: Capsule())
                            .foregroundStyle(.orange)
                    }
                }
                if let outcome = summary.project.outcome, !outcome.isEmpty {
                    Text(outcome).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                if total > 0 {
                    HStack(spacing: 8) {
                        ProgressView(value: progress)
                            .tint(progress == 1 ? .green : .indigo)
                        Text("\(summary.doneTasks)/\(total)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let projects = ProjectRepository(ctx).projects()
            async let tasks = TaskRepository(ctx).tasks()
            async let areasLoad = AreaRepository(ctx).areas()
            summaries = ProjectSummary.summarize(projects: try await projects, tasks: try await tasks)
            areas = try await areasLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}

/// New-project dialog with area selection or inline area creation —
/// mirrors the web create-project dialog.
struct NewProjectSheet: View {
    let areas: [Area]
    let onCreate: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var outcome = ""
    @State private var areaId: UUID?
    @State private var newArea = false
    @State private var newAreaName = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Project name", text: $name)
                    TextField("Desired outcome — what does done look like?", text: $outcome, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section("Area of focus") {
                    Picker("Area", selection: $areaId) {
                        Text("No area").tag(UUID?.none)
                        ForEach(areas) { area in
                            Text(area.name).tag(UUID?.some(area.id))
                        }
                    }
                    Toggle("New area", isOn: $newArea)
                    if newArea {
                        TextField("Area name (e.g. Health, Family, Work)", text: $newAreaName)
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle("New project")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Creating…" : "Create") { Task { await create() } }
                        .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 320)
        #endif
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            var finalAreaId = areaId
            let areaName = newAreaName.trimmingCharacters(in: .whitespaces)
            if newArea && !areaName.isEmpty {
                finalAreaId = try await AreaRepository(ctx).create(name: areaName).id
            }
            let trimmedOutcome = outcome.trimmingCharacters(in: .whitespaces)
            _ = try await ProjectRepository(ctx).create(
                name: name.trimmingCharacters(in: .whitespaces),
                outcome: trimmedOutcome.isEmpty ? nil : trimmedOutcome,
                areaId: finalAreaId)
            await onCreate()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
