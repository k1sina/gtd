import ClarityCore
import ClarityKit
import Foundation
import SwiftUI

/// Current-space menu: switch between spaces, create a shared one, or join
/// via an invite link — mirrors the web sidebar's space switcher.
struct SpaceSwitcherMenu: View {
    @Environment(AppSession.self) private var session
    @State private var showNewSpace = false
    @State private var showJoin = false

    var body: some View {
        Menu {
            ForEach(session.spaces) { space in
                Button {
                    session.switchSpace(to: space.id)
                } label: {
                    if space.id == session.currentSpaceId {
                        Label(spaceLabel(space), systemImage: "checkmark")
                    } else {
                        Text(spaceLabel(space))
                    }
                }
            }
            Divider()
            Button("New shared space…") { showNewSpace = true }
            Button("Join a space…") { showJoin = true }
        } label: {
            Label(session.currentSpace.map(spaceLabel) ?? "Space",
                  systemImage: session.currentSpace?.isPersonal == false ? "person.2" : "person")
        }
        .sheet(isPresented: $showNewSpace) { NewSpaceSheet() }
        .sheet(isPresented: $showJoin) { JoinSpaceSheet() }
    }

    private func spaceLabel(_ space: ClarityCore.Space) -> String {
        space.isPersonal ? "\(space.name) (personal)" : space.name
    }
}

struct NewSpaceSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("New shared space").font(.headline)
            Text("A space you can invite others into — tasks and projects in it are visible to every member.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            TextField("Space name", text: $name)
                .textFieldStyle(.roundedBorder)
                .onSubmit { Task { await create() } }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button(busy ? "Creating…" : "Create") { Task { await create() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(minWidth: 320)
        #if os(iOS)
        .presentationDetents([.medium])
        #endif
    }

    private func create() async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let ctx = try session.requireContext()
            let space = try await SpaceRepository(ctx).createSpace(name: trimmed)
            try await session.loadSpaces()
            session.switchSpace(to: space.id)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct JoinSpaceSheet: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var input = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Join a space").font(.headline)
            Text("Paste the invite link (or just the token) you were sent.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            TextField("https://…/invite/…", text: $input)
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                #endif
                .onSubmit { Task { await join() } }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button(busy ? "Joining…" : "Join") { Task { await join() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || Self.token(in: input) == nil)
            }
        }
        .padding(20)
        .frame(minWidth: 360)
        #if os(iOS)
        .presentationDetents([.medium])
        #endif
    }

    /// Extract the invite token UUID from a pasted link or bare token.
    static func token(in text: String) -> UUID? {
        guard let pattern = try? Regex(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),
            let match = text.matches(of: pattern).last
        else { return nil }
        return UUID(uuidString: String(text[match.range]))
    }

    private func join() async {
        guard let token = Self.token(in: input) else { return }
        busy = true
        defer { busy = false }
        do {
            try await session.acceptInvite(token: token)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
