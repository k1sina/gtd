import ClarityKit
import SwiftUI

struct SignInView: View {
    @Environment(AppSession.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
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

            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                #if os(iOS)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                #endif
            SecureField("Password", text: $password)
                .onSubmit { Task { await signIn() } }

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }

            Button {
                Task { await signIn() }
            } label: {
                Text(busy ? "Signing in…" : "Sign in")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy || email.isEmpty || password.isEmpty)
        }
        .textFieldStyle(.roundedBorder)
        .padding(32)
        .frame(maxWidth: 380)
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            try await session.signIn(email: email, password: password)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
