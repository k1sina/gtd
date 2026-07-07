import ClarityCore
import ClarityKit
import SwiftUI

/// Quick capture — the TextField gives dictation and scribble for free on
/// watchOS; text goes through the natural-language parser.
struct WatchCaptureView: View {
    @Environment(AppSession.self) private var session
    @State private var text = ""
    @State private var confirmation: String?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.indigo)
                TextField("Capture…", text: $text)
                    .onSubmit { Task { await capture() } }
                Button(busy ? "Saving…" : "Save to Inbox") {
                    Task { await capture() }
                }
                .disabled(busy || text.trimmingCharacters(in: .whitespaces).isEmpty)
                if let confirmation {
                    Text(confirmation)
                        .font(.footnote)
                        .foregroundStyle(.green)
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Capture")
    }

    private func capture() async {
        let input = text.trimmingCharacters(in: .whitespaces)
        guard !input.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let task = try await TaskRepository(ctx).capture(input)
            text = ""
            error = nil
            confirmation = "Captured “\(task.title)”"
        } catch {
            self.error = error.localizedDescription
            confirmation = nil
        }
    }
}
