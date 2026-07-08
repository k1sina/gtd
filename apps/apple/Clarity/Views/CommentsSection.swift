import ClarityCore
import ClarityKit
import SwiftUI

/// Comment thread inside the task editor — shared spaces only, mirroring
/// the web task detail dialog.
struct CommentsSection: View {
    let task: TaskItem

    @Environment(AppSession.self) private var session
    @State private var comments: [TaskCommentInfo] = []
    @State private var draft = ""
    @State private var error: String?

    var body: some View {
        if session.currentSpace?.isPersonal == false {
            Section("Comments") {
                ForEach(comments) { comment in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(comment.profile.displayName)
                                .font(.caption.bold())
                            Text(comment.createdAt.formatted(.relative(presentation: .named)))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Text(comment.body)
                            .font(.callout)
                    }
                    .padding(.vertical, 2)
                }
                HStack {
                    TextField("Add a comment…", text: $draft)
                        .textFieldStyle(.plain)
                        .onSubmit { Task { await send() } }
                    Button("Send") { Task { await send() } }
                        .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                        .buttonStyle(.borderless)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
            }
            .task(id: session.reloadKey) { await load() }
        }
    }

    private func load() async {
        guard let ctx = try? session.requireContext() else { return }
        comments = (try? await CommentRepository(ctx).comments(taskId: task.id)) ?? []
    }

    private func send() async {
        let body = draft.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty else { return }
        draft = ""
        do {
            let ctx = try session.requireContext()
            try await CommentRepository(ctx).add(taskId: task.id, body: body)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
