import ClarityCore
import ClarityKit
import SwiftUI

#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Members, invites, and invite links for the current shared space —
/// mirrors the web sharing settings. Shown in Settings for non-personal
/// spaces only.
struct SharingSettingsSection: View {
    @Environment(AppSession.self) private var session
    @State private var members: [SpaceMemberInfo] = []
    @State private var invites: [SpaceInvite] = []
    @State private var inviteEmail = ""
    @State private var copiedToken: UUID?
    @State private var error: String?

    private var pending: [SpaceInvite] {
        invites.filter { $0.acceptedAt == nil }
    }

    var body: some View {
        Section("Members") {
            ForEach(members) { member in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.profile.displayName.isEmpty
                            ? member.profile.email : member.profile.displayName)
                        Text(member.profile.email)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(member.role.rawValue)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            member.role == .owner
                                ? Color.indigo.opacity(0.15)
                                : Color.secondary.opacity(0.1),
                            in: Capsule())
                        .foregroundStyle(member.role == .owner ? Color.indigo : Color.secondary)
                }
            }
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
        }
        .task(id: session.reloadKey) { await load() }

        Section("Invite someone") {
            HStack {
                TextField("email@example.com", text: $inviteEmail)
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    #endif
                    .onSubmit { Task { await invite() } }
                Button("Invite") { Task { await invite() } }
                    .disabled(!inviteEmail.contains("@"))
            }
            ForEach(pending) { invite in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(invite.email)
                        Text("Invited \(invite.createdAt.formatted(date: .abbreviated, time: .omitted))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(copiedToken == invite.token ? "Copied!" : "Copy link") {
                        copyLink(invite)
                    }
                    .font(.caption)
                    Button("Revoke", role: .destructive) {
                        Task { await revoke(invite) }
                    }
                    .font(.caption)
                }
                .buttonStyle(.borderless)
            }
        }
    }

    /// The invite link points at the web app, whose /invite page runs the
    /// accept flow; the native "Join a space" sheet accepts the same link.
    private func copyLink(_ invite: SpaceInvite) {
        let link = "\(ClarityAPI.webBaseURL)/invite/\(invite.token.uuidString.lowercased())"
        #if os(iOS)
        UIPasteboard.general.string = link
        #else
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(link, forType: .string)
        #endif
        copiedToken = invite.token
        Task {
            try? await Task.sleep(for: .seconds(2))
            if copiedToken == invite.token { copiedToken = nil }
        }
    }

    private func load() async {
        do {
            let ctx = try session.requireContext()
            let repo = SpaceRepository(ctx)
            async let membersLoad = repo.members()
            async let invitesLoad = repo.invites()
            members = try await membersLoad
            invites = try await invitesLoad
            error = nil
        } catch {
            // Invites are owner-only under RLS; show members even if the
            // invite list is not accessible.
            self.error = members.isEmpty ? error.localizedDescription : nil
        }
    }

    private func invite() async {
        let email = inviteEmail.trimmingCharacters(in: .whitespaces).lowercased()
        guard email.contains("@") else { return }
        do {
            let ctx = try session.requireContext()
            _ = try await SpaceRepository(ctx).createInvite(email: email)
            inviteEmail = ""
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func revoke(_ invite: SpaceInvite) async {
        do {
            let ctx = try session.requireContext()
            try await SpaceRepository(ctx).revokeInvite(id: invite.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
