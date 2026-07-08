import ClarityCore
import ClarityKit
import SwiftUI

/// AI chat over the web API's agent loop — mirrors the web assistant page.
/// History is read straight from Supabase; sending goes through /api/chat.
struct AssistantView: View {
    @Environment(AppSession.self) private var session
    @State private var sessions: [ChatSession] = []
    @State private var selectedSession: UUID?
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var thinking = false
    @State private var error: String?

    private static let quickPrompts = [
        "What should I focus on today?",
        "Prioritise my inbox",
        "Any stalled projects?",
        "Plan my day",
    ]

    var body: some View {
        VStack(spacing: 0) {
            thread
            Divider()
            inputBar
        }
        .navigationTitle("Assistant")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        selectedSession = nil
                        messages = []
                    } label: {
                        Label("New conversation", systemImage: "square.and.pencil")
                    }
                    if !sessions.isEmpty {
                        Divider()
                        ForEach(sessions) { chat in
                            Button {
                                selectedSession = chat.id
                                Task { await loadMessages() }
                            } label: {
                                if chat.id == selectedSession {
                                    Label(chat.title, systemImage: "checkmark")
                                } else {
                                    Text(chat.title)
                                }
                            }
                        }
                        Divider()
                        if let selectedSession {
                            Button(role: .destructive) {
                                Task { await deleteSession(selectedSession) }
                            } label: {
                                Label("Delete conversation", systemImage: "trash")
                            }
                        }
                    }
                } label: {
                    Label("Conversations", systemImage: "clock.arrow.circlepath")
                }
            }
        }
        .task(id: session.dataEpoch) { await loadSessions() }
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if messages.isEmpty && !thinking {
                        emptyState
                    }
                    ForEach(messages) { message in
                        bubble(message)
                    }
                    if thinking {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            Text("Thinking…").font(.caption).foregroundStyle(.secondary)
                        }
                        .id("thinking")
                    }
                    if let error {
                        Text(error).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding()
            }
            .onChange(of: messages.count) {
                if let last = messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your GTD coach — it can read and change your tasks, projects, and plan.")
                .font(.callout)
                .foregroundStyle(.secondary)
            ForEach(Self.quickPrompts, id: \.self) { prompt in
                Button {
                    input = prompt
                    Task { await send() }
                } label: {
                    Text(prompt)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.indigo.opacity(0.1), in: Capsule())
                        .foregroundStyle(Color.indigo)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 24)
    }

    @ViewBuilder
    private func bubble(_ message: ChatMessage) -> some View {
        let isUser = message.role == "user"
        let text = message.text
        // Tool-result "user" rows and empty assistant iterations aren't
        // conversation — hide them like the web thread does.
        if !text.isEmpty || !message.toolNames.isEmpty {
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                ForEach(message.toolNames, id: \.self) { tool in
                    Label(toolCaption(tool), systemImage: "gearshape.2")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if !text.isEmpty {
                    Text(LocalizedStringKey(text)) // renders the assistant's markdown
                        .textSelection(.enabled)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            isUser ? Color.indigo.opacity(0.15) : Color.secondary.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
            .id(message.id)
        }
    }

    private func toolCaption(_ name: String) -> String {
        switch name {
        case "list_tasks": return "Looked at your tasks"
        case "create_task": return "Created a task"
        case "update_task": return "Updated a task"
        case "complete_task": return "Completed a task"
        case "list_projects": return "Looked at your projects"
        case "create_project": return "Created a project"
        case "plan_day": return "Planned your day"
        default: return name
        }
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("Ask or instruct…", text: $input, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .onSubmit { Task { await send() } }
            Button {
                Task { await send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.indigo)
            }
            .buttonStyle(.plain)
            .disabled(thinking || input.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(10)
    }

    private func loadSessions() async {
        guard let ctx = try? session.requireContext() else { return }
        sessions = (try? await ChatRepository(ctx).sessions()) ?? []
        if selectedSession == nil, messages.isEmpty, let first = sessions.first {
            selectedSession = first.id
            await loadMessages()
        }
    }

    private func loadMessages() async {
        guard let selectedSession, let ctx = try? session.requireContext() else {
            messages = []
            return
        }
        messages = (try? await ChatRepository(ctx).messages(sessionId: selectedSession)) ?? []
    }

    private func send() async {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty, !thinking else { return }
        input = ""
        error = nil
        thinking = true
        defer { thinking = false }
        // Optimistic local echo of the user message.
        messages.append(ChatMessage(
            id: UUID(), sessionId: selectedSession ?? UUID(), role: "user",
            content: [.text(text)]))
        do {
            let ctx = try session.requireContext()
            guard let api = ClarityAPI(client: ctx.client) else {
                throw ClarityAPI.APIError.notConfigured
            }
            let response = try await api.chat(
                message: text, spaceId: ctx.spaceId, sessionId: selectedSession)
            selectedSession = response.sessionId
            await loadMessages()
            await loadSessions()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteSession(_ id: UUID) async {
        guard let ctx = try? session.requireContext() else { return }
        try? await ChatRepository(ctx).deleteSession(id: id)
        selectedSession = nil
        messages = []
        await loadSessions()
    }
}
