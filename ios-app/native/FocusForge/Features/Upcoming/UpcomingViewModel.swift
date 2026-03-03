import Foundation

@MainActor
final class UpcomingViewModel: ObservableObject {
    @Published var tasks: [MobileTaskDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            tasks = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.fetchUpcoming(accessToken: accessToken)
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleComplete(_ task: MobileTaskDTO) async {
        do {
            let updated = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.updateTask(
                    accessToken: accessToken,
                    taskID: task.id,
                    request: PatchTaskRequest(name: nil, description: nil, due_date: nil, due_time: nil, priority: nil, completed: !task.completed)
                )
            }
            if let idx = tasks.firstIndex(where: { $0.id == updated.id }) {
                tasks[idx] = updated
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTask(_ taskID: String) async {
        do {
            try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.deleteTask(accessToken: accessToken, taskID: taskID)
            }
            tasks.removeAll { $0.id == taskID }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func applyTaskUpdate(_ task: MobileTaskDTO) {
        if let idx = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[idx] = task
        } else {
            tasks.insert(task, at: 0)
        }
    }

    func removeTask(_ taskID: String) {
        tasks.removeAll { $0.id == taskID }
    }
}
