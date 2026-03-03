import Foundation

@MainActor
final class ProjectsViewModel: ObservableObject {
    @Published var organizations: [BootstrapOrganization] = []
    @Published var projects: [BootstrapProject] = []
    @Published var taskLists: [MobileTaskListDTO] = []
    @Published var projectTasks: [MobileTaskDTO] = []
    @Published var projectTaskCounts: [String: Int] = [:]
    @Published var areProjectCountsLoaded = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    private(set) var activeProjectID: String?

    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    func loadOrganizations() async {
        isLoading = true
        areProjectCountsLoaded = false
        defer { isLoading = false }

        do {
            let payload = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                async let loadedOrganizations = repository.fetchOrganizations(accessToken: accessToken)
                async let loadedProjects = repository.fetchProjects(accessToken: accessToken)
                async let loadedTasks = repository.fetchAll(accessToken: accessToken)
                return try await (loadedOrganizations, loadedProjects, loadedTasks)
            }
            organizations = payload.0
            projects = payload.1
            let allTasks = payload.2
            projectTaskCounts = Dictionary(
                grouping: allTasks.filter { !$0.completed && ($0.project_id?.isEmpty == false) },
                by: { $0.project_id ?? "" }
            ).mapValues(\.count)
            areProjectCountsLoaded = true
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            areProjectCountsLoaded = false
        }
    }

    func projects(for organizationID: String) -> [BootstrapProject] {
        projects.filter { $0.organization_id == organizationID }
    }

    func taskCount(for projectID: String) -> Int {
        projectTaskCounts[projectID] ?? 0
    }

    func loadTaskLists(projectID: String) async {
        isLoading = true
        defer { isLoading = false }
        activeProjectID = projectID

        do {
            taskLists = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.fetchProjectTaskLists(
                    accessToken: accessToken,
                    projectID: projectID
                )
            }
        } catch {
            taskLists = []
        }

        do {
            projectTasks = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.fetchProjectTasks(
                    accessToken: accessToken,
                    projectID: projectID
                )
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var displayedTaskLists: [MobileTaskListDTO] {
        if taskLists.contains(where: { normalizedSectionID($0.section_id) == nil }) {
            return taskLists.map { list in
                guard normalizedSectionID(list.section_id) == nil else { return list }
                return MobileTaskListDTO(
                    id: list.id,
                    section_id: nil,
                    name: "Uncategorized",
                    task_count: projectTasks.filter { normalizedSectionID($0.section_id) == nil }.count
                )
            }
        }
        return [
            MobileTaskListDTO(
                id: "unsectioned",
                section_id: nil,
                name: "Uncategorized",
                task_count: projectTasks.filter { normalizedSectionID($0.section_id) == nil }.count
            )
        ] + taskLists
    }

    func createTaskList(projectID: String, name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        do {
            _ = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.createProjectTaskList(
                    accessToken: accessToken,
                    projectID: projectID,
                    name: trimmed
                )
            }
            await loadTaskLists(projectID: projectID)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func moveTask(taskID: String, to taskList: MobileTaskListDTO, projectID: String) async {
        do {
            let updated = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.updateTask(
                    accessToken: accessToken,
                    taskID: taskID,
                    request: PatchTaskRequest(section_id: taskList.section_id)
                )
            }

            if let index = projectTasks.firstIndex(where: { $0.id == updated.id }) {
                projectTasks[index] = updated
            }

            await loadTaskLists(projectID: projectID)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func tasks(for taskList: MobileTaskListDTO) -> [MobileTaskDTO] {
        let targetSection = normalizedSectionID(taskList.section_id)
        let filtered = projectTasks.filter { normalizedSectionID($0.section_id) == targetSection }

        return filtered.sorted { lhs, rhs in
            if lhs.priority != rhs.priority {
                return lhs.priority < rhs.priority
            }
            let leftDate = lhs.due_date ?? "9999-12-31"
            let rightDate = rhs.due_date ?? "9999-12-31"
            if leftDate != rightDate {
                return leftDate < rightDate
            }
            if lhs.completed != rhs.completed {
                return lhs.completed == false
            }
            if lhs.name != rhs.name {
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            return lhs.id < rhs.id
        }
    }

    private func normalizedSectionID(_ raw: String?) -> String? {
        guard let value = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        let lowered = value.lowercased()
        if lowered == "unsectioned" || lowered == "uncategorized" {
            return nil
        }
        return value
    }

    func applyTaskUpdate(_ task: MobileTaskDTO) {
        if let index = projectTasks.firstIndex(where: { $0.id == task.id }) {
            projectTasks[index] = task
        } else {
            projectTasks.insert(task, at: 0)
        }
    }

    func removeTask(_ taskID: String) {
        projectTasks.removeAll(where: { $0.id == taskID })
    }
}
