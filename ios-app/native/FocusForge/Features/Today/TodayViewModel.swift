import Foundation

@MainActor
final class TodayViewModel: ObservableObject {
    enum SortOption: String, CaseIterable, Identifiable {
        case priorityHigh = "Priority (High First)"
        case dueDate = "Due Date"
        case name = "Name"

        var id: String { rawValue }
    }

    enum FilterOption: String, CaseIterable, Identifiable {
        case open = "Open"
        case all = "All"
        case completed = "Completed"
        case highPriority = "High Priority"

        var id: String { rawValue }
    }

    @Published var tasks: [MobileTaskDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var showingTaskEditor = false
    @Published var editingTask: MobileTaskDTO?
    @Published var searchQuery = ""
    @Published var sortOption: SortOption = .priorityHigh
    @Published var filterOption: FilterOption = .open

    private let repository: TaskRepository
    private unowned let sessionStore: SessionStore

    init(repository: TaskRepository, sessionStore: SessionStore) {
        self.repository = repository
        self.sessionStore = sessionStore
    }

    var visibleTasks: [MobileTaskDTO] {
        var result = tasks

        switch filterOption {
        case .open:
            result = result.filter { !$0.completed }
        case .all:
            break
        case .completed:
            result = result.filter(\.completed)
        case .highPriority:
            result = result.filter { !$0.completed && $0.priority <= 2 }
        }

        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            result = result.filter { task in
                let inName = task.name.localizedCaseInsensitiveContains(trimmed)
                let inDescription = task.description?.localizedCaseInsensitiveContains(trimmed) ?? false
                return inName || inDescription
            }
        }

        return result.sorted { lhs, rhs in
            switch sortOption {
            case .priorityHigh:
                if lhs.priority != rhs.priority {
                    return lhs.priority < rhs.priority
                }
                let leftDue = lhs.due_date ?? "9999-12-31"
                let rightDue = rhs.due_date ?? "9999-12-31"
                if leftDue != rightDue { return leftDue < rightDue }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            case .dueDate:
                let leftDue = lhs.due_date ?? "9999-12-31"
                let rightDue = rhs.due_date ?? "9999-12-31"
                if leftDue != rightDue { return leftDue < rightDue }
                if lhs.priority != rhs.priority { return lhs.priority < rhs.priority }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            case .name:
                let compare = lhs.name.localizedCaseInsensitiveCompare(rhs.name)
                if compare != .orderedSame { return compare == .orderedAscending }
                if lhs.priority != rhs.priority { return lhs.priority < rhs.priority }
                return (lhs.due_date ?? "9999-12-31") < (rhs.due_date ?? "9999-12-31")
            }
        }
    }

    func loadInitial() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let loaded = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                _ = try await repository.bootstrap(accessToken: accessToken)
                return try await repository.fetchToday(accessToken: accessToken)
            }
            tasks = loaded
            errorMessage = nil
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
                    section_id: nil,
                    completed: $0.completed
                )
            }
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        do {
            tasks = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.fetchToday(accessToken: accessToken)
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createTask(name: String, description: String?) async {
        do {
            let created = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.createTask(
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
            }
            tasks.insert(created, at: 0)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateTask(taskID: String, patch: PatchTaskRequest) async {
        do {
            let updated = try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.updateTask(accessToken: accessToken, taskID: taskID, request: patch)
            }
            if let index = tasks.firstIndex(where: { $0.id == updated.id }) {
                tasks[index] = updated
            }
            errorMessage = nil
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
        do {
            try await sessionStore.withAuthenticatedToken { [repository] accessToken in
                try await repository.deleteTask(accessToken: accessToken, taskID: taskID)
            }
            tasks.removeAll(where: { $0.id == taskID })
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func applyTaskUpdate(_ task: MobileTaskDTO) {
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index] = task
        } else {
            tasks.insert(task, at: 0)
        }
    }

    func removeTask(_ taskID: String) {
        tasks.removeAll(where: { $0.id == taskID })
    }
}
