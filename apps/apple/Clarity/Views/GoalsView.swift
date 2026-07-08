import ClarityCore
import ClarityKit
import SwiftUI

/// Life values and quarterly goals (GTD horizons) — mirrors the web goals
/// page.
struct GoalsView: View {
    @Environment(AppSession.self) private var session
    @State private var values: [LifeValue] = []
    @State private var goals: [Goal] = []
    @State private var editingValue: ValueDraft?
    @State private var editingGoal: GoalDraft?
    @State private var error: String?

    /// Goals grouped by quarter, newest first (repository orders that way).
    private var groupedGoals: [(label: String, goals: [Goal])] {
        var seen: [String] = []
        var groups: [String: [Goal]] = [:]
        for goal in goals {
            let label = "Q\(goal.quarter) \(goal.year)"
            if groups[label] == nil { seen.append(label) }
            groups[label, default: []].append(goal)
        }
        return seen.map { (label: $0, goals: groups[$0] ?? []) }
    }

    private func activeGoalCount(for value: LifeValue) -> Int {
        goals.filter { $0.valueId == value.id && $0.status == .active }.count
    }

    var body: some View {
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            Section {
                if values.isEmpty {
                    Text("What matters to you long-term — health, family, craft, freedom. Goals hang off these.")
                        .foregroundStyle(.secondary)
                }
                ForEach(values) { value in
                    Button {
                        editingValue = ValueDraft(value: value)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(value.name).foregroundStyle(.primary)
                                if let description = value.description, !description.isEmpty {
                                    Text(description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                            }
                            Spacer()
                            let count = activeGoalCount(for: value)
                            if count > 0 {
                                Text("\(count) goal\(count == 1 ? "" : "s")")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button("Delete", role: .destructive) {
                            Task { await deleteValue(value) }
                        }
                    }
                }
                Button {
                    editingValue = ValueDraft()
                } label: {
                    Label("New value", systemImage: "plus")
                }
            } header: {
                Text("Life values")
            }
            ForEach(groupedGoals, id: \.label) { group in
                Section(group.label) {
                    ForEach(group.goals) { goal in
                        Button {
                            editingGoal = GoalDraft(goal: goal)
                        } label: {
                            goalRow(goal)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing) {
                            Button("Delete", role: .destructive) {
                                Task { await deleteGoal(goal) }
                            }
                        }
                    }
                }
            }
            Section {
                Button {
                    editingGoal = GoalDraft()
                } label: {
                    Label("New goal", systemImage: "plus")
                }
            }
        }
        .navigationTitle("Goals & values")
        .refreshable { await load() }
        .task(id: session.dataEpoch) { await load() }
        .sheet(item: $editingValue) { draft in
            ValueEditSheet(draft: draft) { await load() }
        }
        .sheet(item: $editingGoal) { draft in
            GoalEditSheet(draft: draft, values: values) { await load() }
        }
    }

    private func goalRow(_ goal: Goal) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(goal.title).foregroundStyle(.primary)
                HStack(spacing: 6) {
                    if let valueId = goal.valueId,
                       let value = values.first(where: { $0.id == valueId }) {
                        Label(value.name, systemImage: "heart")
                    }
                    if let score = goal.score {
                        Label("\(score)/10", systemImage: "gauge")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Text(goal.status.label)
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(statusColor(goal.status).opacity(0.15), in: Capsule())
                .foregroundStyle(statusColor(goal.status))
        }
    }

    private func statusColor(_ status: GoalStatus) -> Color {
        switch status {
        case .active: return .indigo
        case .achieved: return .green
        case .partial: return .orange
        case .dropped: return .secondary
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            let repo = GoalRepository(ctx)
            async let valuesLoad = repo.lifeValues()
            async let goalsLoad = repo.goals()
            values = try await valuesLoad
            goals = try await goalsLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteValue(_ value: LifeValue) async {
        do {
            let ctx = try session.requireContext()
            try await GoalRepository(ctx).deleteLifeValue(id: value.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteGoal(_ goal: Goal) async {
        do {
            let ctx = try session.requireContext()
            try await GoalRepository(ctx).deleteGoal(id: goal.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ValueDraft: Identifiable {
    var id: UUID?
    var name = ""
    var description = ""

    init() {}

    init(value: LifeValue) {
        id = value.id
        name = value.name
        description = value.description ?? ""
    }
}

struct ValueEditSheet: View {
    @State var draft: ValueDraft
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Value name (e.g. Health)", text: $draft.name)
                TextField("What does this mean to you?", text: $draft.description, axis: .vertical)
                    .lineLimit(2...4)
                if let error {
                    Text(error).foregroundStyle(.red).font(.footnote)
                }
            }
            .navigationTitle(draft.id == nil ? "New value" : "Edit value")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(busy || draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 240)
        #endif
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let description = draft.description.trimmingCharacters(in: .whitespaces)
            _ = try await GoalRepository(ctx).saveLifeValue(
                id: draft.id,
                name: draft.name.trimmingCharacters(in: .whitespaces),
                description: description.isEmpty ? nil : description)
            await onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct GoalDraft: Identifiable {
    var id: UUID?
    var title = ""
    var description = ""
    var year: Int
    var quarter: Int
    var valueId: UUID?
    var status: GoalStatus = .active

    init() {
        let (year, quarter) = quarterOf(Date())
        self.year = year
        self.quarter = quarter
    }

    init(goal: Goal) {
        id = goal.id
        title = goal.title
        description = goal.description ?? ""
        year = goal.year
        quarter = goal.quarter
        valueId = goal.valueId
        status = goal.status
    }
}

struct GoalEditSheet: View {
    @State var draft: GoalDraft
    let values: [LifeValue]
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Goal title", text: $draft.title)
                    TextField("Description (optional)", text: $draft.description, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section {
                    Picker("Quarter", selection: $draft.quarter) {
                        ForEach(1...4, id: \.self) { Text("Q\($0)").tag($0) }
                    }
                    Stepper("Year: \(String(draft.year))", value: $draft.year,
                            in: 2020...2100)
                    Picker("Life value", selection: $draft.valueId) {
                        Text("None").tag(UUID?.none)
                        ForEach(values) { value in
                            Text(value.name).tag(UUID?.some(value.id))
                        }
                    }
                    Picker("Status", selection: $draft.status) {
                        ForEach(GoalStatus.allCases, id: \.self) { status in
                            Text(status.label).tag(status)
                        }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle(draft.id == nil ? "New goal" : "Edit goal")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(busy || draft.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 400, minHeight: 360)
        #endif
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let description = draft.description.trimmingCharacters(in: .whitespaces)
            _ = try await GoalRepository(ctx).saveGoal(
                id: draft.id,
                title: draft.title.trimmingCharacters(in: .whitespaces),
                description: description.isEmpty ? nil : description,
                year: draft.year, quarter: draft.quarter,
                valueId: draft.valueId, status: draft.status)
            await onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
