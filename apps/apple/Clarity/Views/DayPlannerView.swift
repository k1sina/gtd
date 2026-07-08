import ClarityCore
import ClarityKit
import SwiftUI

/// Today's schedule: calendar events + focus blocks on a timeline, with
/// Plan my day / Confirm / Dismiss — mirrors the web DayPlanner. Rendered as
/// a section inside the Today list. Degrades gracefully when the web API is
/// unreachable.
struct DayPlannerView: View {
    @Environment(AppSession.self) private var session
    @State private var blocks: [TimeBlock] = []
    @State private var taskTitles: [UUID: String] = [:]
    @State private var events: [ClarityAPI.CalendarEvent] = []
    @State private var calendarConnected = false
    @State private var planning = false
    @State private var notice: String?
    @State private var error: String?

    private var todayKey: String { Dates.dateKey(Date()) }
    private var suggested: [TimeBlock] { blocks.filter { $0.status == .suggested } }

    private enum Entry: Identifiable {
        case event(ClarityAPI.CalendarEvent)
        case block(TimeBlock)

        var id: String {
            switch self {
            case .event(let event): return "event-\(event.id)"
            case .block(let block): return "block-\(block.id.uuidString)"
            }
        }

        var start: Date {
            switch self {
            case .event(let event): return event.startDate ?? .distantPast
            case .block(let block): return block.startsAt
            }
        }
    }

    private var timeline: [Entry] {
        (events.filter { !$0.allDay }.map(Entry.event) + blocks.map(Entry.block))
            .sorted { $0.start < $1.start }
    }

    var body: some View {
        Section("Schedule") {
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            if let notice {
                Text(notice).font(.footnote).foregroundStyle(.secondary)
            }
            if timeline.isEmpty {
                Text(calendarConnected
                    ? "Nothing on the schedule yet."
                    : "No focus blocks yet. Connect Google Calendar on the web to plan around your events.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            ForEach(timeline) { entry in
                row(entry)
            }
            HStack {
                Button {
                    Task { await plan() }
                } label: {
                    Label(planning ? "Planning…" : "Plan my day", systemImage: "wand.and.stars")
                }
                .disabled(planning)
                if !suggested.isEmpty {
                    Spacer()
                    Button("Confirm \(suggested.count)") {
                        Task { await confirm() }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    Button("Dismiss") {
                        Task { await dismissSuggestions() }
                    }
                    .controlSize(.small)
                }
            }
            .buttonStyle(.borderless)
        }
        .task(id: session.reloadKey) { await load() }
    }

    @ViewBuilder
    private func row(_ entry: Entry) -> some View {
        switch entry {
        case .event(let event):
            HStack {
                timeLabel(event.startDate, event.endDate)
                Text(event.summary)
                Spacer()
                Image(systemName: "calendar").foregroundStyle(.secondary).font(.caption)
            }
            .font(.callout)
            .foregroundStyle(.secondary)
        case .block(let block):
            HStack {
                timeLabel(block.startsAt, block.endsAt)
                Text("⚡ \(taskTitles[block.taskId ?? UUID()] ?? "Focus block")")
                Spacer()
                Text(block.status == .suggested ? "suggested" : block.status.rawValue)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        block.status == .suggested
                            ? Color.orange.opacity(0.15) : Color.green.opacity(0.15),
                        in: Capsule())
                    .foregroundStyle(block.status == .suggested ? Color.orange : Color.green)
            }
            .font(.callout)
        }
    }

    private func timeLabel(_ start: Date?, _ end: Date?) -> some View {
        Text(start.map { $0.formatted(date: .omitted, time: .shortened) } ?? "—")
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .frame(width: 64, alignment: .leading)
    }

    private func load() async {
        guard let ctx = try? session.requireContext() else { return }
        blocks = (try? await PlannerRepository(ctx).timeBlocks(on: Date())) ?? []
        await loadTaskTitles(ctx: ctx)
        // Calendar events come from the web API; missing connectivity or
        // configuration must not break Today.
        if let api = ClarityAPI(client: ctx.client),
           let response = try? await api.calendarEvents(dateKey: todayKey) {
            events = response.events
            calendarConnected = response.connected
        }
    }

    private func loadTaskTitles(ctx: RepositoryContext) async {
        let missing = blocks.compactMap(\.taskId).filter { taskTitles[$0] == nil }
        guard !missing.isEmpty else { return }
        let fetched = (try? await TaskRepository(ctx).tasks(ids: missing)) ?? []
        for task in fetched {
            taskTitles[task.id] = task.title
        }
    }

    private func plan() async {
        planning = true
        defer { planning = false }
        do {
            let ctx = try session.requireContext()
            guard let api = ClarityAPI(client: ctx.client) else {
                throw ClarityAPI.APIError.notConfigured
            }
            let response = try await api.planDay(dateKey: todayKey, spaceId: ctx.spaceId)
            calendarConnected = response.calendarConnected
            for block in response.blocks {
                if let taskId = block.taskId, let title = block.title {
                    taskTitles[taskId] = title
                }
            }
            notice = response.blocks.isEmpty ? "Nothing to plan — no open tasks fit today." : nil
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func confirm() async {
        do {
            let ctx = try session.requireContext()
            guard let api = ClarityAPI(client: ctx.client) else {
                throw ClarityAPI.APIError.notConfigured
            }
            _ = try await api.confirmPlan(blockIds: suggested.map(\.id))
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func dismissSuggestions() async {
        do {
            let ctx = try session.requireContext()
            guard let api = ClarityAPI(client: ctx.client) else {
                throw ClarityAPI.APIError.notConfigured
            }
            try await api.dismissPlan(dateKey: todayKey)
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
