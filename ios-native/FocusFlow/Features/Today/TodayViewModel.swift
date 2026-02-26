import Foundation

@MainActor
final class TodayViewModel: ObservableObject {
    @Published var tasks: [MobileTaskDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showingTaskEditor = false
    @Published var editingTask: MobileTaskDTO?

    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    func loadInitial() async {
        guard let accessToken = sessionStore.accessToken else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await repository.bootstrap(accessToken: accessToken)
            tasks = try await repository.fetchToday(accessToken: accessToken)
        } catch {
            tasks = repository.cachedTasks().map {
                MobileTaskDTO(
                    id: $0.id,
                    name: $0.name,
                    description: $0.taskDescription,
                    due_date: $0.dueDate.isEmpty ? nil : $0.dueDate,
                    due_time: $0.dueTime.isEmpty ? nil : $0.dueTime,
                    priority: $0.priority,
                    project_id: $0.projectID.isEmpty ? nil : $0.projectID,
                    completed: $0.completed
                )
            }
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        guard let accessToken = sessionStore.accessToken else { return }
        do {
            tasks = try await repository.fetchToday(accessToken: accessToken)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createTask(name: String, description: String?) async {
        guard let accessToken = sessionStore.accessToken else { return }
        do {
            let created = try await repository.createTask(
                accessToken: accessToken,
                request: CreateTaskRequest(
                    name: name,
                    description: description,
                    due_date: nil,
                    due_time: nil,
                    priority: 4,
                    project_id: nil
                )
            )
            tasks.insert(created, at: 0)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateTask(taskID: String, patch: PatchTaskRequest) async {
        guard let accessToken = sessionStore.accessToken else { return }
        do {
            let updated = try await repository.updateTask(accessToken: accessToken, taskID: taskID, request: patch)
            if let index = tasks.firstIndex(where: { $0.id == updated.id }) {
                tasks[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleComplete(_ task: MobileTaskDTO) async {
        await updateTask(
            taskID: task.id,
            patch: PatchTaskRequest(
                name: nil,
                description: nil,
                due_date: nil,
                due_time: nil,
                priority: nil,
                completed: !task.completed
            )
        )
    }

    func deleteTask(taskID: String) async {
        guard let accessToken = sessionStore.accessToken else { return }
        do {
            try await repository.deleteTask(accessToken: accessToken, taskID: taskID)
            tasks.removeAll(where: { $0.id == taskID })
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
