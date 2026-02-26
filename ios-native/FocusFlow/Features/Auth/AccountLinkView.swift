import SwiftUI

struct AccountLinkView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: SessionStore

    @State private var email = ""
    @State private var password = ""
    @State private var transferTaskOwnership = true
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var preview: LinkVerifyPayload?
    @State private var resultMessage: String?

    let onLinked: () async -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Existing Account Credentials") {
                    TextField("Existing account email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                    SecureField("Existing account password", text: $password)
                }

                if let preview {
                    Section("Merge Preview") {
                        Text("Source: \(preview.source_user.email)")
                        Text("Memberships to merge: \(preview.preview.organization_memberships)")
                        Text("Tasks assigned to source: \(preview.preview.assigned_tasks)")
                        Toggle("Transfer task ownership", isOn: $transferTaskOwnership)
                    }
                }

                if let resultMessage {
                    Section("Result") {
                        Text(resultMessage)
                    }
                }

                if let errorMessage {
                    Section("Error") {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Link Account")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if isLoading {
                        ProgressView()
                    } else if preview == nil {
                        Button("Verify") {
                            Task { await verify() }
                        }
                        .disabled(email.isEmpty || password.isEmpty)
                    } else {
                        Button("Link") {
                            Task { await complete() }
                        }
                    }
                }
            }
        }
    }

    private func verify() async {
        isLoading = true
        errorMessage = nil
        resultMessage = nil
        defer { isLoading = false }

        do {
            preview = try await sessionStore.verifyAccountLink(email: email, password: password)
            password = ""
        } catch {
            preview = nil
            errorMessage = error.localizedDescription
        }
    }

    private func complete() async {
        guard let preview else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let result = try await sessionStore.completeAccountLink(
                linkToken: preview.link_token,
                transferTaskOwnership: transferTaskOwnership
            )
            resultMessage = "Linked. Memberships added: \(result.memberships_added). Tasks transferred: \(result.tasks_transferred)."
            await onLinked()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

