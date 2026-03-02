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
        guard let accessToken = sessionStore.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            tasks = try await repository.fetchUpcoming(accessToken: accessToken)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleComplete(_ task: MobileTaskDTO) async {
        guard let accessToken = sessionStore.accessToken else { return }
        do {
            let updated = try await repository.updateTask(
                accessToken: accessToken,
                taskID: task.id,
                request: PatchTaskRequest(name: nil, description: nil, due_date: nil, due_time: nil, priority: nil, completed: !task.completed)
            )
            if let idx = tasks.firstIndex(where: { $0.id == updated.id }) {
                tasks[idx] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteTask(_ taskID: String) async {
        guard let accessToken = sessionStore.accessToken else { return }
        do {
            try await repository.deleteTask(accessToken: accessToken, taskID: taskID)
            tasks.removeAll { $0.id == taskID }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
