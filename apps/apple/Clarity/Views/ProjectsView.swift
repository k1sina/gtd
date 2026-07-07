import ClarityCore
import ClarityKit
import SwiftUI

/// Projects with open counts; stalled = active but no next action.
struct ProjectsView: View {
    @Environment(AppSession.self) private var session
    @State private var summaries: [ProjectSummary] = []
    @State private var newProjectName = ""
    @State private var loading = true
    @State private var error: String?

    private var active: [ProjectSummary] {
        summaries.filter { $0.project.status == "active" }
    }

    private var other: [ProjectSummary] {
        summaries.filter { $0.project.status != "active" && $0.project.status != "archived" }
    }

    var body: some View {
        List {
            Section {
                HStack {
                    Image(systemName: "plus.circle.fill").foregroundStyle(.indigo)
                    TextField("New project…", text: $newProjectName)
                        .textFieldStyle(.plain)
                        .onSubmit { Task { await createProject() } }
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section("Active") {
                if active.isEmpty && !loading {
                    Text("No active projects.").foregroundStyle(.secondary)
                }
                ForEach(active) { summary in row(summary) }
            }
            if !other.isEmpty {
                Section("Someday & on hold") {
                    ForEach(other) { summary in row(summary) }
                }
            }
        }
        .navigationTitle("Projects")
        .refreshable { await load() }
        .task { await load() }
        .navigationDestination(for: Project.self) { project in
            ProjectDetailView(project: project)
        }
    }

    private func row(_ summary: ProjectSummary) -> some View {
        NavigationLink(value: summary.project) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(summary.project.name)
                    if let outcome = summary.project.outcome, !outcome.isEmpty {
                        Text(outcome).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
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
                Text("\(summary.openTasks)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            async let projects = ProjectRepository(ctx).projects()
            async let tasks = TaskRepository(ctx).tasks()
            summaries = ProjectSummary.summarize(projects: try await projects, tasks: try await tasks)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func createProject() async {
        let name = newProjectName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        newProjectName = ""
        do {
            let ctx = try session.requireContext()
            _ = try await ProjectRepository(ctx).create(name: name)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
