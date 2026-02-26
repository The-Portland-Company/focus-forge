import Foundation

@MainActor
final class SessionStore: ObservableObject {
    @Published var accessToken: String?
    @Published var refreshToken: String?
    @Published var user: MobileUserDTO?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient: APIClient

    init(apiClient: APIClient = APIClient()) {
        self.apiClient = apiClient
        self.accessToken = KeychainStore.load(key: "ff_access_token")
        self.refreshToken = KeychainStore.load(key: "ff_refresh_token")
    }

    var isAuthenticated: Bool {
        accessToken != nil
    }

    func completeAppleSignIn(identityToken: String, nonce: String? = nil) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let envelope = try await apiClient.request(
                path: "/api/mobile/auth/apple",
                method: "POST",
                body: AppleExchangeRequest(identity_token: identityToken, nonce: nonce),
                responseType: APIEnvelope<MobileSessionPayload>.self
            )

            guard let session = envelope.data else {
                throw APIClient.APIError.serverError(envelope.error?.message ?? "Sign in failed")
            }

            applySession(session)
        } catch {
            print("Apple sign in failure:", error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    func refreshIfNeeded() async {
        guard let refreshToken else { return }
        do {
            let envelope = try await apiClient.request(
                path: "/api/mobile/auth/refresh",
                method: "POST",
                body: RefreshRequest(refresh_token: refreshToken),
                responseType: APIEnvelope<MobileSessionPayload>.self
            )

            if let session = envelope.data {
                applySession(session)
            }
        } catch {
            logoutLocally()
        }
    }

    func logout() async {
        guard let accessToken else {
            logoutLocally()
            return
        }

        _ = try? await apiClient.request(
            path: "/api/mobile/auth/logout",
            method: "POST",
            accessToken: accessToken,
            responseType: APIEnvelope<EmptyPayload>.self
        )

        logoutLocally()
    }

    func verifyAccountLink(email: String, password: String) async throws -> LinkVerifyPayload {
        try await performAuthenticatedRequest { [self] accessToken in
            let envelope = try await self.apiClient.request(
                path: "/api/mobile/account/link/verify",
                method: "POST",
                accessToken: accessToken,
                body: LinkVerifyRequest(email: email, password: password),
                responseType: APIEnvelope<LinkVerifyPayload>.self
            )

            guard let payload = envelope.data else {
                throw APIClient.APIError.serverError(envelope.error?.message ?? "Account verification failed")
            }

            return payload
        }
    }

    func completeAccountLink(linkToken: String, transferTaskOwnership: Bool) async throws -> LinkCompletePayload {
        try await performAuthenticatedRequest { [self] accessToken in
            let envelope = try await self.apiClient.request(
                path: "/api/mobile/account/link/complete",
                method: "POST",
                accessToken: accessToken,
                body: LinkCompleteRequest(
                    link_token: linkToken,
                    transfer_task_ownership: transferTaskOwnership
                ),
                responseType: APIEnvelope<LinkCompletePayload>.self
            )

            guard let payload = envelope.data else {
                throw APIClient.APIError.serverError(envelope.error?.message ?? "Account linking failed")
            }

            return payload
        }
    }

    private func performAuthenticatedRequest<T>(
        _ request: @escaping (String) async throws -> T
    ) async throws -> T {
        guard let token = accessToken else {
            throw APIClient.APIError.unauthorized("No access token in session")
        }

        do {
            return try await request(token)
        } catch let error as APIClient.APIError {
            if case .unauthorized = error {
                await refreshIfNeeded()
                guard let refreshed = accessToken else {
                    throw APIClient.APIError.unauthorized("Session expired and refresh failed")
                }
                return try await request(refreshed)
            }
            throw error
        }
    }

    private func applySession(_ session: MobileSessionPayload) {
        accessToken = session.access_token
        refreshToken = session.refresh_token
        user = session.user

        KeychainStore.save(session.access_token, for: "ff_access_token")
        KeychainStore.save(session.refresh_token, for: "ff_refresh_token")
    }

    func logoutLocally() {
        accessToken = nil
        refreshToken = nil
        user = nil
        KeychainStore.delete(key: "ff_access_token")
        KeychainStore.delete(key: "ff_refresh_token")
    }
}
