import Foundation
import os

@MainActor
final class SessionStore: ObservableObject {
    @Published var accessToken: String?
    @Published var refreshToken: String?
    @Published var user: MobileUserDTO?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient: APIClient
    private let authLogger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.theportlandcompany.focusforge",
        category: "auth"
    )

    init(apiClient: APIClient = APIClient()) {
        self.apiClient = apiClient
        self.accessToken = KeychainStore.load(key: "ff_access_token")
        self.refreshToken = KeychainStore.load(key: "ff_refresh_token")
    }

    var isAuthenticated: Bool {
        accessToken != nil
    }

    func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let envelope = try await apiClient.request(
                path: "/api/mobile/auth/login",
                method: "POST",
                body: LoginRequest(email: email, password: password),
                responseType: APIEnvelope<MobileSessionPayload>.self
            )

            guard let session = envelope.data else {
                throw APIClient.APIError.serverError(envelope.error?.message ?? "Login failed")
            }

            applySession(session)
            errorMessage = nil
        } catch {
            print("Email login failure:", error.localizedDescription)
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func refreshIfNeeded() async -> Bool {
        guard let refreshToken else {
            logoutLocally()
            return false
        }
        do {
            let envelope = try await apiClient.request(
                path: "/api/mobile/auth/refresh",
                method: "POST",
                body: RefreshRequest(refresh_token: refreshToken),
                responseType: APIEnvelope<MobileSessionPayload>.self
            )

            if let session = envelope.data {
                applySession(session)
                return true
            }
            logoutLocally()
            return false
        } catch {
            logoutLocally()
            return false
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

    func withAuthenticatedToken<T>(
        _ request: @escaping (String) async throws -> T
    ) async throws -> T {
        try await performAuthenticatedRequest(request)
    }

    private func performAuthenticatedRequest<T>(
        _ request: @escaping (String) async throws -> T
    ) async throws -> T {
        guard let initialToken = accessToken else {
            throw APIClient.APIError.unauthorized("No access token in session")
        }
        var token = initialToken

        if isTokenExpired(token) {
            let refreshedOK = await refreshIfNeeded()
            guard refreshedOK, let refreshed = accessToken else {
                throw APIClient.APIError.unauthorized("Session expired and refresh failed")
            }
            token = refreshed
        }

        do {
            return try await request(token)
        } catch let error as APIClient.APIError {
            if case .unauthorized = error {
                let refreshedOK = await refreshIfNeeded()
                guard refreshedOK, let refreshed = accessToken else {
                    throw APIClient.APIError.unauthorized("Session expired and refresh failed")
                }
                return try await request(refreshed)
            }
            throw error
        }
    }

    private func isTokenExpired(_ token: String) -> Bool {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return false }
        let payloadPart = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = 4 - (payloadPart.count % 4)
        let padded = payloadPart + String(repeating: "=", count: padding == 4 ? 0 : padding)
        guard let data = Data(base64Encoded: padded),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = object["exp"] as? TimeInterval else {
            return false
        }
        return exp <= Date().timeIntervalSince1970 + 30
    }

    private func applySession(_ session: MobileSessionPayload) {
        accessToken = session.access_token
        refreshToken = session.refresh_token
        user = session.user

        KeychainStore.save(session.access_token, for: "ff_access_token")
        KeychainStore.save(session.refresh_token, for: "ff_refresh_token")
        authLogger.log("Session stored in keychain")
    }

    func logoutLocally() {
        accessToken = nil
        refreshToken = nil
        user = nil
        KeychainStore.delete(key: "ff_access_token")
        KeychainStore.delete(key: "ff_refresh_token")
    }

}

@MainActor
final class TaskDetailStore: ObservableObject {
    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    func updateTask(taskID: String, request: PatchTaskRequest) async throws -> MobileTaskDTO {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.updateTask(
                accessToken: accessToken,
                taskID: taskID,
                request: request
            )
        }
    }

    func deleteTask(taskID: String) async throws {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.deleteTask(accessToken: accessToken, taskID: taskID)
        }
    }

    func fetchTaskComments(taskID: String) async throws -> [MobileCommentDTO] {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.fetchTaskComments(accessToken: accessToken, taskID: taskID)
        }
    }

    func createTaskComment(
        taskID: String,
        projectID: String?,
        content: String
    ) async throws -> MobileCommentDTO {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.createTaskComment(
                accessToken: accessToken,
                taskID: taskID,
                projectID: projectID,
                content: content
            )
        }
    }

    func fetchOrganizations() async throws -> [BootstrapOrganization] {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.fetchOrganizations(accessToken: accessToken)
        }
    }

    func fetchProjects() async throws -> [BootstrapProject] {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.fetchProjects(accessToken: accessToken)
        }
    }

    func fetchTaskLists(projectID: String) async throws -> [MobileTaskListDTO] {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.fetchProjectTaskLists(accessToken: accessToken, projectID: projectID)
        }
    }

    func createOrganization(name: String) async throws -> BootstrapOrganization {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.createOrganization(accessToken: accessToken, name: name)
        }
    }

    func createProject(name: String, organizationID: String) async throws -> BootstrapProject {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.createProject(
                accessToken: accessToken,
                organizationID: organizationID,
                name: name
            )
        }
    }

    func createTaskList(projectID: String, name: String) async throws -> MobileTaskListDTO {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.createProjectTaskList(
                accessToken: accessToken,
                projectID: projectID,
                name: name
            )
        }
    }

    func createTask(request: CreateTaskRequest) async throws -> MobileTaskDTO {
        try await sessionStore.withAuthenticatedToken { [repository] accessToken in
            try await repository.createTask(accessToken: accessToken, request: request)
        }
    }
}
