import ClarityCore
import ClarityKit
import SwiftUI

/// The lifetime map — experiences placed into windows of a life (age ranges),
/// not onto dates. Mirrors the web /experiences page: a year grid for the
/// scale, then a chapter per decade. Without a birth date there is no scale,
/// so the setup form comes first.
struct LifeMapView: View {
    @Environment(AppSession.self) private var session
    @State private var horizon: LifeHorizon?
    @State private var experiences: [LifeExperience] = []
    @State private var values: [LifeValue] = []
    @State private var editing: ExperienceDraft?
    @State private var editingHorizon = false
    @State private var categoryFilter: ExperienceCategory?
    @State private var showPast = false
    @State private var showReleased = false
    @State private var loaded = false
    @State private var error: String?

    private var scale: LifeHorizonInput? { horizon?.input }

    private var visible: [LifeExperience] {
        guard let categoryFilter else { return experiences }
        return experiences.filter { $0.category == categoryFilter }
    }

    private var unplaced: [LifeExperience] {
        visible.filter {
            $0.status != .released && $0.targetAgeStart == nil && $0.targetAgeEnd == nil
        }
    }

    private var released: [LifeExperience] {
        visible.filter { $0.status == .released }
    }

    private func placed(in chapter: LifeChapter) -> [LifeExperience] {
        guard let scale else { return [] }
        return visible.filter { experience in
            guard experience.status != .released,
                  let start = experience.targetAgeStart ?? experience.targetAgeEnd
            else { return false }
            return chapterKey(forAge: start, horizon: scale) == chapter.key
        }
    }

    var body: some View {
        Group {
            if let scale {
                map(scale)
            } else if loaded {
                HorizonSetupView(horizon: horizon) { await load() }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Life experiences")
        .refreshable { await load() }
        .task(id: session.dataEpoch) { await load() }
        .toolbar {
            if scale != nil {
                ToolbarItem {
                    Menu {
                        Picker("Kind", selection: $categoryFilter) {
                            Text("All kinds").tag(ExperienceCategory?.none)
                            ForEach(ExperienceCategory.allCases, id: \.self) { category in
                                Label(category.label, systemImage: category.systemImage)
                                    .tag(ExperienceCategory?.some(category))
                            }
                        }
                        Toggle("Show chapters behind you", isOn: $showPast)
                        Toggle("Show released", isOn: $showReleased)
                        Button("Adjust horizon…") { editingHorizon = true }
                    } label: {
                        Label("View", systemImage: "line.3.horizontal.decrease.circle")
                    }
                }
                ToolbarItem {
                    Button {
                        editing = ExperienceDraft()
                    } label: {
                        Label("New experience", systemImage: "plus")
                    }
                }
            }
        }
        .sheet(item: $editing) { draft in
            ExperienceEditSheet(draft: draft, scale: scale, values: values) {
                await load()
            }
        }
        .sheet(isPresented: $editingHorizon) {
            HorizonEditSheet(horizon: horizon) { await load() }
        }
    }

    @ViewBuilder
    private func map(_ scale: LifeHorizonInput) -> some View {
        let chapters = lifeChapters(scale)
        List {
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }

            Section {
                LifeYearGrid(scale: scale, experiences: visible) { age in
                    editing = ExperienceDraft(atAge: age)
                }
            } header: {
                LifeHeadline(scale: scale, experiences: experiences)
            } footer: {
                Text(
                    "Each square is a year. Grey is spent, a solid square is where an experience starts, the tint behind it is the window it can happen in. Tap a year to put something in it."
                )
            }

            if !unplaced.isEmpty {
                Section {
                    ForEach(unplaced) { experience in
                        row(experience, scale: scale)
                    }
                } header: {
                    Text("Not placed in life yet · \(unplaced.count)")
                } footer: {
                    Text("A dream without a window is a dream that keeps sliding. Give each one an age.")
                }
            }

            ForEach(chapters.filter { showPast || !$0.isPast || !placed(in: $0).isEmpty }) { chapter in
                Section {
                    let rows = placed(in: chapter)
                    if rows.isEmpty {
                        Button {
                            editing = ExperienceDraft(in: chapter, currentAge: lifeProgress(scale).age)
                        } label: {
                            Label(
                                chapter.isPast
                                    ? "Add something you lived then"
                                    : "Nothing here yet — what do you want it to hold?",
                                systemImage: "plus")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        ForEach(rows) { experience in
                            row(experience, scale: scale)
                        }
                    }
                } header: {
                    ChapterHeader(chapter: chapter)
                }
            }

            if showReleased && !released.isEmpty {
                Section("Released · \(released.count)") {
                    ForEach(released) { experience in
                        row(experience, scale: scale)
                    }
                }
            }
        }
    }

    private func row(_ experience: LifeExperience, scale: LifeHorizonInput) -> some View {
        Button {
            editing = ExperienceDraft(experience: experience)
        } label: {
            ExperienceRow(experience: experience, scale: scale)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) {
            Button("Delete", role: .destructive) {
                Task { await delete(experience) }
            }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            let repo = LifeMapRepository(ctx)
            async let horizonLoad = repo.horizon()
            async let experiencesLoad = repo.experiences()
            async let valuesLoad = GoalRepository(ctx).lifeValues()
            horizon = try await horizonLoad
            experiences = try await experiencesLoad
            values = try await valuesLoad
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func delete(_ experience: LifeExperience) async {
        do {
            let ctx = try session.requireContext()
            try await LifeMapRepository(ctx).deleteExperience(id: experience.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Header

/// The finite scale everything else is read against.
private struct LifeHeadline: View {
    let scale: LifeHorizonInput
    let experiences: [LifeExperience]

    var body: some View {
        let progress = lifeProgress(scale)
        // Experiences whose window has not closed yet — what the years ahead
        // still hold. Counting years instead would inflate with wide windows.
        let ahead = experiences.filter {
            $0.status != .released
                && ($0.targetAgeEnd ?? $0.targetAgeStart ?? -1) >= progress.age
        }.count

        VStack(alignment: .leading, spacing: 2) {
            Text("You are \(progress.age). Planning to \(scale.lifeExpectancy) leaves you")
                .font(.footnote)
                .textCase(nil)
            Text("\(progress.yearsLeft) more years")
                .font(.title2.weight(.semibold))
                .foregroundStyle(.primary)
                .textCase(nil)
            Text(
                ahead == 0
                    ? "Nothing is placed in them yet."
                    : "\(ahead) experience\(ahead == 1 ? "" : "s") placed in them · \(progress.percentLived)% of the horizon spent"
            )
            .font(.footnote)
            .textCase(nil)
        }
        .padding(.vertical, 4)
    }
}

/// One square per year of life, ten to a row — the whole horizon at a glance.
private struct LifeYearGrid: View {
    let scale: LifeHorizonInput
    let experiences: [LifeExperience]
    let onPick: (Int) -> Void

    /// Which experiences touch which year — this is what turns the grid from
    /// a memento mori into a plan.
    private var byAge: [Int: [LifeExperience]] {
        var map: [Int: [LifeExperience]] = [:]
        for experience in experiences where experience.status != .released {
            guard let start = experience.targetAgeStart ?? experience.targetAgeEnd
            else { continue }
            let end = experience.targetAgeEnd ?? start
            for age in start...max(start, end) {
                map[age, default: []].append(experience)
            }
        }
        return map
    }

    var body: some View {
        let progress = lifeProgress(scale)
        let byAge = byAge
        let decades = lifeChapters(scale).filter { $0.endAge != nil }

        VStack(alignment: .leading, spacing: 3) {
            ForEach(decades) { decade in
                HStack(spacing: 3) {
                    Text("\(decade.startAge)")
                        .font(.system(size: 9))
                        .monospacedDigit()
                        .foregroundStyle(.tertiary)
                        .frame(width: 16, alignment: .trailing)
                    ForEach(decade.startAge...(decade.startAge + 9), id: \.self) { age in
                        YearSquare(
                            age: age,
                            here: byAge[age] ?? [],
                            currentAge: progress.age,
                            beyondHorizon: age > scale.lifeExpectancy,
                            onPick: onPick)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct YearSquare: View {
    let age: Int
    let here: [LifeExperience]
    let currentAge: Int
    let beyondHorizon: Bool
    let onPick: (Int) -> Void

    var body: some View {
        // A solid square is where an experience starts; a tint is a window
        // passing through, so wide windows read as bands, not blocks.
        let starts = here.filter { ($0.targetAgeStart ?? $0.targetAgeEnd) == age }
        let color = (starts.first ?? here.first)?.category.color
        let spent = age < currentAge

        Button { onPick(age) } label: {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(fill(color: color, starts: !starts.isEmpty, spent: spent))
                .overlay {
                    RoundedRectangle(cornerRadius: 2.5)
                        .strokeBorder(
                            color ?? .secondary,
                            style: StrokeStyle(
                                lineWidth: age == currentAge ? 1.5 : 0.5,
                                dash: color == nil && beyondHorizon ? [1.5, 1.5] : []))
                        .opacity(age == currentAge ? 1 : (color == nil ? 0.35 : 0.5))
                }
                .frame(width: 14, height: 14)
                .opacity(spent && color != nil ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            here.isEmpty
                ? "Age \(age), nothing planned"
                : "Age \(age), \(here.map(\.title).joined(separator: ", "))")
    }

    private func fill(color: Color?, starts: Bool, spent: Bool) -> Color {
        guard let color else {
            return spent ? Color.secondary.opacity(0.25) : .clear
        }
        return starts ? color : color.opacity(0.25)
    }
}

private struct ChapterHeader: View {
    let chapter: LifeChapter

    var body: some View {
        let ages = chapter.endAge.map { "age \(chapter.startAge)–\($0)" }
            ?? "age \(chapter.startAge)+"
        let years = chapter.endYear.map { "\(chapter.startYear)–\($0)" }
            ?? "\(chapter.startYear) →"

        HStack {
            Text(chapter.label)
                .font(.subheadline.weight(.semibold))
                .textCase(nil)
            if chapter.isCurrent {
                Text("you are here")
                    .font(.caption2)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Color.accentColor.opacity(0.15), in: Capsule())
                    .foregroundStyle(Color.accentColor)
                    .textCase(nil)
            }
            Spacer()
            Text("\(ages) · \(years)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .textCase(nil)
        }
    }
}

private struct ExperienceRow: View {
    let experience: LifeExperience
    let scale: LifeHorizonInput

    var body: some View {
        let window = experienceWindow(experience, horizon: scale)
        let lived = experience.status == .lived

        HStack(spacing: 10) {
            Image(systemName: lived ? "checkmark" : experience.category.systemImage)
                .font(.footnote)
                .foregroundStyle(experience.category.color)
                .frame(width: 24, height: 24)
                .background(experience.category.color.opacity(0.15), in: RoundedRectangle(cornerRadius: 6))

            VStack(alignment: .leading, spacing: 2) {
                Text(experience.title)
                    .foregroundStyle(lived || experience.status == .released ? .secondary : .primary)
                    .strikethrough(lived || experience.status == .released)
                HStack(spacing: 6) {
                    Text(window?.label ?? "no time chosen")
                    if let withWhom = experience.withWhom, !withWhom.isEmpty {
                        Text("with \(withWhom)")
                    }
                    if experience.status == .active {
                        Text("in motion").foregroundStyle(Color.accentColor)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            if window?.missed == true {
                flag("window passed", color: .red)
            } else if window?.closingSoon == true {
                flag("closing soon", color: .orange)
            }
        }
    }

    private func flag(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

// MARK: - Horizon setup

/// First run: the map needs a scale before it can be drawn at all.
private struct HorizonSetupView: View {
    let horizon: LifeHorizon?
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @State private var birthDate = Date()
    @State private var lifeExpectancy = 85
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                DatePicker(
                    "Your birth date", selection: $birthDate,
                    in: ...Date(), displayedComponents: .date)
                Stepper("Planning to age \(lifeExpectancy)", value: $lifeExpectancy, in: 40...120)
                Button(busy ? "Saving…" : "Draw the map") { Task { await save() } }
                    .disabled(busy)
            } header: {
                Text("Draw your lifetime map")
            } footer: {
                Text(
                    "Experiences get placed into windows of your life — “in my 40s”, “before the kids leave” — not onto dates. For that, the map needs a scale. Planning to an age is not a prediction; it is the horizon you choose to plan against. Private to you."
                )
            }
            if let error {
                Section { Text(error).foregroundStyle(.red).font(.footnote) }
            }
        }
        .formStyle(.grouped)
        .onAppear {
            if let existing = horizon {
                lifeExpectancy = existing.lifeExpectancy
                if let parsed = existing.birthDate.flatMap(dateFromKey) { birthDate = parsed }
            }
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            try await LifeMapRepository(ctx).saveHorizon(
                birthDate: dateKey(birthDate), lifeExpectancy: lifeExpectancy)
            await onSave()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct HorizonEditSheet: View {
    let horizon: LifeHorizon?
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var birthDate = Date()
    @State private var lifeExpectancy = 85
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                DatePicker(
                    "Born", selection: $birthDate, in: ...Date(),
                    displayedComponents: .date)
                Stepper("Planning to age \(lifeExpectancy)", value: $lifeExpectancy, in: 40...120)
                Section {
                    Text("Not a prediction — the horizon you choose to plan against. Shorten it and the map gets honest fast.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Your horizon")
            #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(busy)
                }
            }
        }
        .onAppear {
            if let horizon {
                lifeExpectancy = horizon.lifeExpectancy
                if let parsed = horizon.birthDate.flatMap(dateFromKey) { birthDate = parsed }
            }
        }
        #if os(macOS)
            .frame(minWidth: 380, minHeight: 260)
        #endif
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            try await LifeMapRepository(ctx).saveHorizon(
                birthDate: dateKey(birthDate), lifeExpectancy: lifeExpectancy)
            await onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Editing an experience

struct ExperienceDraft: Identifiable {
    var id: UUID?
    var title = ""
    var notes = ""
    var category: ExperienceCategory = .other
    var status: ExperienceStatus = .dream
    var startAge: Int?
    var endAge: Int?
    var withWhom = ""
    var valueId: UUID?
    var livedOn: Date?
    var reflection = ""

    init() {}

    /// From tapping a year square.
    init(atAge age: Int) {
        startAge = age
        endAge = age
        status = .planned
    }

    /// From a chapter's "add" row; past chapters are for recording, not planning.
    init(in chapter: LifeChapter, currentAge: Int) {
        if chapter.isPast {
            startAge = chapter.startAge
            endAge = chapter.endAge ?? chapter.startAge + 9
            status = .lived
            livedOn = Date()
        } else {
            startAge = max(chapter.startAge, currentAge)
            endAge = chapter.endAge ?? chapter.startAge + 9
            status = .planned
        }
    }

    init(experience: LifeExperience) {
        id = experience.id
        title = experience.title
        notes = experience.notes ?? ""
        category = experience.category
        status = experience.status
        startAge = experience.targetAgeStart
        endAge = experience.targetAgeEnd
        withWhom = experience.withWhom ?? ""
        valueId = experience.valueId
        livedOn = experience.livedOn.flatMap(dateFromKey)
        reflection = experience.reflection ?? ""
    }
}

struct ExperienceEditSheet: View {
    @State var draft: ExperienceDraft
    let scale: LifeHorizonInput?
    let values: [LifeValue]
    let onSave: () async -> Void

    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var error: String?

    private var currentAge: Int { scale.map { lifeProgress($0).age } ?? 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What do you want to experience?", text: $draft.title)
                    Picker("Kind", selection: $draft.category) {
                        ForEach(ExperienceCategory.allCases, id: \.self) { category in
                            Label(category.label, systemImage: category.systemImage)
                                .tag(category)
                        }
                    }
                }

                Section {
                    windowPresets
                    Toggle(
                        "Placed in life",
                        isOn: Binding(
                            get: { draft.startAge != nil || draft.endAge != nil },
                            set: { placed in
                                if placed {
                                    setWindow(currentAge, currentAge)
                                } else {
                                    setWindow(nil, nil)
                                }
                            }))
                    if draft.startAge != nil || draft.endAge != nil {
                        Stepper(
                            "From age \(draft.startAge ?? currentAge)",
                            value: Binding(
                                get: { draft.startAge ?? currentAge },
                                set: { draft.startAge = $0 }),
                            in: 0...120)
                        Stepper(
                            "To age \(draft.endAge ?? draft.startAge ?? currentAge)",
                            value: Binding(
                                get: { draft.endAge ?? draft.startAge ?? currentAge },
                                set: { draft.endAge = $0 }),
                            in: 0...120)
                    }
                } header: {
                    Text("When in your life?")
                } footer: {
                    Text(windowFooter)
                }

                Section {
                    TextField("With whom (alone, with Eli, with the kids…)", text: $draft.withWhom)
                    Picker("Serves which value", selection: $draft.valueId) {
                        Text("None").tag(UUID?.none)
                        ForEach(values) { value in
                            Text(value.name).tag(UUID?.some(value.id))
                        }
                    }
                    TextField(
                        "Why this one? What would it mean to have lived it?",
                        text: $draft.notes, axis: .vertical
                    )
                    .lineLimit(2...4)
                }

                Section("Where it stands") {
                    Picker("Status", selection: $draft.status) {
                        ForEach(ExperienceStatus.allCases, id: \.self) { status in
                            Text(status.label).tag(status)
                        }
                    }
                    .pickerStyle(.menu)
                    if draft.status == .lived {
                        DatePicker(
                            "Lived on",
                            selection: Binding(
                                get: { draft.livedOn ?? Date() },
                                set: { draft.livedOn = $0 }),
                            displayedComponents: .date)
                    }
                    if draft.status == .lived || draft.status == .released {
                        TextField(
                            draft.status == .lived
                                ? "What was it actually like?"
                                : "Why are you letting this one go?",
                            text: $draft.reflection, axis: .vertical
                        )
                        .lineLimit(2...4)
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .formStyle(.grouped)
            .navigationTitle(draft.id == nil ? "New experience" : "Experience")
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
            .frame(minWidth: 440, minHeight: 520)
        #endif
    }

    @ViewBuilder
    private var windowPresets: some View {
        if let scale {
            Menu("Pick a window…") {
                Button("This year") { setWindow(currentAge, currentAge) }
                Button("Next 3 years") { setWindow(currentAge, currentAge + 3) }
                ForEach(lifeChapters(scale).filter { ($0.endAge ?? 999) >= currentAge }) { chapter in
                    Button(chapter.label.replacingOccurrences(of: "Your ", with: "In my ")) {
                        setWindow(chapter.startAge, chapter.endAge ?? chapter.startAge + 9)
                    }
                }
                Button("Not yet — keep it a dream") { setWindow(nil, nil) }
            }
        }
    }

    private var windowFooter: String {
        guard let scale else {
            return "Ages, not dates. Set a birth date to see which years these are."
        }
        let probe = LifeExperience(
            id: UUID(), userId: UUID(), title: draft.title, category: draft.category,
            status: draft.status, targetAgeStart: draft.startAge,
            targetAgeEnd: draft.endAge)
        guard let window = experienceWindow(probe, horizon: scale) else {
            return "Nothing chosen — it stays a dream."
        }
        if window.missed {
            return "\(window.label) — that window has already closed. Move it, or release it on purpose."
        }
        return window.label
    }

    /// A window makes it planned, losing one makes it a dream again — unless
    /// it has already been lived or released.
    private func setWindow(_ start: Int?, _ end: Int?) {
        draft.startAge = start
        draft.endAge = end
        if draft.status == .lived || draft.status == .released { return }
        draft.status = start == nil && end == nil ? .dream : .planned
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let withWhom = draft.withWhom.trimmingCharacters(in: .whitespaces)
            let notes = draft.notes.trimmingCharacters(in: .whitespaces)
            let reflection = draft.reflection.trimmingCharacters(in: .whitespaces)
            // An open-ended window means the single year it opens in.
            let start = draft.startAge ?? draft.endAge
            let end = draft.endAge ?? draft.startAge
            try await LifeMapRepository(ctx).saveExperience(
                id: draft.id,
                title: draft.title.trimmingCharacters(in: .whitespaces),
                notes: notes.isEmpty ? nil : notes,
                category: draft.category,
                status: draft.status,
                targetAgeStart: start,
                targetAgeEnd: end.map { max($0, start ?? $0) },
                withWhom: withWhom.isEmpty ? nil : withWhom,
                valueId: draft.valueId,
                livedOn: draft.status == .lived ? dateKey(draft.livedOn ?? Date()) : nil,
                reflection: reflection.isEmpty ? nil : reflection)
            await onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Postgres `date` helpers

/// The map's date columns are civil dates ("yyyy-MM-dd"), not instants.
private func dateKey(_ date: Date) -> String {
    Dates.dateKey(date)
}

private func dateFromKey(_ key: String) -> Date? {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    return formatter.date(from: key)
}
