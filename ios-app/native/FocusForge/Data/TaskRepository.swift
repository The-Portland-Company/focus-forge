import Foundation
import SwiftData

@MainActor
final class TaskRepository {
    private let apiClient: APIClient
    private let context: ModelContext

    init(apiClient: APIClient, context: ModelContext) {
        self.apiClient = apiClient
        self.context = context
    }

    func bootstrap(accessToken: String) async throws -> BootstrapPayload {
        let envelope = try await apiClient.request(
            path: "/api/mobile/bootstrap",
            accessToken: accessToken,
            responseType: APIEnvelope<BootstrapPayload>.self
        )

        guard let payload = envelope.data else {
            throw APIClient.APIError.serverError(envelope.error?.message ?? "Bootstrap failed")
        }

        cache(payload: payload)
        return payload
    }

    func fetchTasks(accessToken: String, view: String = "all", projectID: String? = nil) async throws -> [MobileTaskDTO] {
        var query = "/api/mobile/tasks?view=\(view)"
        if let projectID, !projectID.isEmpty {
            query += "&projectId=\(projectID)"
        }

        let envelope = try await apiClient.request(
            path: query,
            accessToken: accessToken,
            responseType: APIEnvelope<[MobileTaskDTO]>.self
        )

        let tasks = envelope.data ?? []
        cache(tasks: tasks)
        return tasks
    }

    func fetchToday(accessToken: String) async throws -> [MobileTaskDTO] {
        try await fetchTasks(accessToken: accessToken, view: "today")
    }

    func fetchUpcoming(accessToken: String) async throws -> [MobileTaskDTO] {
        try await fetchTasks(accessToken: accessToken, view: "upcoming")
    }

    func fetchAll(accessToken: String) async throws -> [MobileTaskDTO] {
        try await fetchTasks(accessToken: accessToken, view: "all")
    }

    func fetchProjects(accessToken: String) async throws -> [BootstrapProject] {
        let payload = try await bootstrap(accessToken: accessToken)
        return payload.projects
    }

    func fetchOrganizations(accessToken: String) async throws -> [BootstrapOrganization] {
        let payload = try await bootstrap(accessToken: accessToken)
        return payload.organizations
    }

    func fetchProjectTaskLists(accessToken: String, projectID: String) async throws -> [MobileTaskListDTO] {
        let envelope = try await apiClient.request(
            path: "/api/mobile/projects/\(projectID)/task-lists",
            accessToken: accessToken,
            responseType: APIEnvelope<[MobileTaskListDTO]>.self
        )

        return envelope.data ?? []
    }

    func fetchProjectTasks(accessToken: String, projectID: String) async throws -> [MobileTaskDTO] {
        let envelope = try await apiClient.request(
            path: "/api/mobile/projects/\(projectID)/tasks",
            accessToken: accessToken,
            responseType: APIEnvelope<[MobileTaskDTO]>.self
        )

        let tasks = envelope.data ?? []
        cache(tasks: tasks)
        return tasks
    }

    func createProjectTaskList(
        accessToken: String,
        projectID: String,
        name: String
    ) async throws -> MobileTaskListDTO {
        let envelope = try await apiClient.request(
            path: "/api/mobile/projects/\(projectID)/task-lists",
            method: "POST",
            accessToken: accessToken,
            body: CreateTaskListRequest(name: name),
            responseType: APIEnvelope<MobileTaskListDTO>.self
        )

        guard let taskList = envelope.data else {
            throw APIClient.APIError.serverError(envelope.error?.message ?? "Create task list failed")
        }

        return taskList
    }

    func createTask(accessToken: String, request: CreateTaskRequest) async throws -> MobileTaskDTO {
        let envelope = try await apiClient.request(
            path: "/api/mobile/tasks",
            method: "POST",
            accessToken: accessToken,
            body: request,
            responseType: APIEnvelope<MobileTaskDTO>.self
        )

        guard let task = envelope.data else {
            throw APIClient.APIError.serverError(envelope.error?.message ?? "Create task failed")
        }

        cache(tasks: [task])
        return task
    }

    func updateTask(accessToken: String, taskID: String, request: PatchTaskRequest) async throws -> MobileTaskDTO {
        let envelope = try await apiClient.request(
            path: "/api/mobile/tasks/\(taskID)",
            method: "PATCH",
            accessToken: accessToken,
            body: request,
            responseType: APIEnvelope<MobileTaskDTO>.self
        )

        guard let task = envelope.data else {
            throw APIClient.APIError.serverError(envelope.error?.message ?? "Update task failed")
        }

        cache(tasks: [task])
        return task
    }

    func deleteTask(accessToken: String, taskID: String) async throws {
        _ = try await apiClient.request(
            path: "/api/mobile/tasks/\(taskID)",
            method: "DELETE",
            accessToken: accessToken,
            responseType: APIEnvelope<EmptyPayload>.self
        )

        let descriptor = FetchDescriptor<CachedTask>(predicate: #Predicate { $0.id == taskID })
        if let existing = try? context.fetch(descriptor).first {
            context.delete(existing)
            try? context.save()
        }
    }

    func cachedTasks() -> [CachedTask] {
        let descriptor = FetchDescriptor<CachedTask>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        return (try? context.fetch(descriptor)) ?? []
    }

    private func cache(payload: BootstrapPayload) {
        let bootstrapUserID = payload.user.id
        let userDescriptor = FetchDescriptor<CachedUser>(
            predicate: #Predicate { $0.id == bootstrapUserID }
        )

        if let existingUser = try? context.fetch(userDescriptor).first {
            existingUser.email = payload.user.email ?? ""
            existingUser.firstName = payload.user.firstName ?? ""
            existingUser.lastName = payload.user.lastName ?? ""
        } else {
            context.insert(
                CachedUser(
                    id: payload.user.id,
                    email: payload.user.email ?? "",
                    firstName: payload.user.firstName ?? "",
                    lastName: payload.user.lastName ?? ""
                )
            )
        }

        payload.projects.forEach { project in
            let projectID = project.id
            let descriptor = FetchDescriptor<CachedProject>(
                predicate: #Predicate { $0.id == projectID }
            )

            if let existing = try? context.fetch(descriptor).first {
                existing.name = project.name
                existing.color = project.color ?? "#3f3f46"
            } else {
                context.insert(
                    CachedProject(
                        id: project.id,
                        name: project.name,
                        color: project.color ?? "#3f3f46"
                    )
                )
            }
        }

        cache(tasks: payload.tasks)
        try? context.save()
    }

    private func cache(tasks: [MobileTaskDTO]) {
        tasks.forEach { task in
            let taskID = task.id
            let descriptor = FetchDescriptor<CachedTask>(predicate: #Predicate { $0.id == taskID })
            let existing = try? context.fetch(descriptor).first

            if let existing {
                existing.name = task.name
                existing.taskDescription = task.description ?? ""
                existing.dueDate = task.due_date ?? ""
                existing.dueTime = task.due_time ?? ""
                existing.priority = task.priority
                existing.projectID = task.project_id ?? ""
                existing.completed = task.completed
                existing.updatedAt = Date()
            } else {
                context.insert(
                    CachedTask(
                        id: task.id,
                        name: task.name,
                        taskDescription: task.description ?? "",
                        dueDate: task.due_date ?? "",
                        dueTime: task.due_time ?? "",
                        priority: task.priority,
                        projectID: task.project_id ?? "",
                        completed: task.completed,
                        updatedAt: Date()
                    )
                )
            }
        }

        try? context.save()
    }
}
