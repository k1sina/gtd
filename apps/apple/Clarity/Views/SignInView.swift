import ClarityKit
import SwiftUI

struct SignInView: View {
    private enum Mode: String, CaseIterable {
        case signIn = "Sign in"
        case signUp = "Create account"
    }

    @Environment(AppSession.self) private var session
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var error: String?
    @State private var notice: String?
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(.indigo)
            Text("Clarity").font(.title2.bold())
            Text("Capture everything. Clarify weekly. Do what matters.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Picker("", selection: $mode) {
                ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if mode == .signUp {
                TextField("Your name", text: $displayName)
                    .textContentType(.name)
            }
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                #if os(iOS)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                #endif
            SecureField("Password", text: $password)
                .textContentType(mode == .signUp ? .newPassword : .password)
                .onSubmit { Task { await submit() } }

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }
            if let notice {
                Text(notice).font(.footnote).foregroundStyle(.secondary)
            }

            Button {
                Task { await submit() }
            } label: {
                Text(buttonTitle).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || email.isEmpty || password.isEmpty)
        }
        .textFieldStyle(.roundedBorder)
        .padding(32)
        .frame(maxWidth: 380)
    }

    private var buttonTitle: String {
        if busy { return mode == .signIn ? "Signing in…" : "Creating account…" }
        return mode.rawValue
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        error = nil
        notice = nil
        do {
            switch mode {
            case .signIn:
                try await session.signIn(email: email, password: password)
            case .signUp:
                // Defaults to the email prefix, same as the web sign-up form.
                let name = displayName.isEmpty
                    ? String(email.split(separator: "@").first ?? "")
                    : displayName
                try await session.signUp(email: email, password: password, displayName: name)
            }
        } catch SessionError.confirmationRequired {
            mode = .signIn
            notice = SessionError.confirmationRequired.errorDescription
        } catch {
            self.error = error.localizedDescription
        }
    }
}
