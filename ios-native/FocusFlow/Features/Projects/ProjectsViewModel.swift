import Foundation

@MainActor
final class ProjectsViewModel: ObservableObject {
    @Published var projects: [BootstrapProject] = []
    @Published var selectedProjectID: String?
    @Published var projectTasks: [MobileTaskDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    func loadProjects() async {
        guard let accessToken = sessionStore.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            projects = try await repository.fetchProjects(accessToken: accessToken)
            if selectedProjectID == nil {
                selectedProjectID = projects.first?.id
            }
            await loadProjectTasks()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadProjectTasks() async {
        guard let accessToken = sessionStore.accessToken,
              let selectedProjectID else {
            projectTasks = []
            return
        }
        do {
            projectTasks = try await repository.fetchTasks(accessToken: accessToken, view: "all", projectID: selectedProjectID)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
