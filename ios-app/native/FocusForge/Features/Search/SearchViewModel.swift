import Foundation

@MainActor
final class SearchViewModel: ObservableObject {
    @Published var allTasks: [MobileTaskDTO] = []
    @Published var query = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    var filtered: [MobileTaskDTO] {
        if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return allTasks
        }
        let q = query.lowercased()
        return allTasks.filter {
            $0.name.lowercased().contains(q) || ($0.description?.lowercased().contains(q) ?? false)
        }
    }

    func load() async {
        guard let accessToken = sessionStore.accessToken else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            allTasks = try await repository.fetchAll(accessToken: accessToken)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
