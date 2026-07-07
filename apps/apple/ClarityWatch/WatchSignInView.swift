import ClarityKit
import SwiftUI

/// One-time sign-in (dictation/scribble); the session persists in the
/// keychain afterwards.
struct WatchSignInView: View {
    @Environment(AppSession.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Clarity").font(.headline)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                SecureField("Password", text: $password)
                if let error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                Button(busy ? "Signing in…" : "Sign in") {
                    Task {
                        busy = true
                        defer { busy = false }
                        do {
                            try await session.signIn(email: email, password: password)
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
                .disabled(busy || email.isEmpty || password.isEmpty)
            }
        }
    }
}
