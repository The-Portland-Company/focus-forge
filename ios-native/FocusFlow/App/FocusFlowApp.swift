import SwiftUI
import SwiftData

@main
struct FocusFlowApp: App {
    @StateObject private var sessionStore: SessionStore
    @StateObject private var todayViewModel: TodayViewModel
    @StateObject private var upcomingViewModel: UpcomingViewModel
    @StateObject private var searchViewModel: SearchViewModel
    @StateObject private var projectsViewModel: ProjectsViewModel

    init() {
        let container = try! ModelContainer(for: CachedUser.self, CachedProject.self, CachedTask.self)
        let context = ModelContext(container)
        let apiClient = APIClient()
        let repository = TaskRepository(apiClient: apiClient, context: context)

        let session = SessionStore(apiClient: apiClient)
        _sessionStore = StateObject(wrappedValue: session)
        _todayViewModel = StateObject(wrappedValue: TodayViewModel(repository: repository, sessionStore: session))
        _upcomingViewModel = StateObject(wrappedValue: UpcomingViewModel(repository: repository, sessionStore: session))
        _searchViewModel = StateObject(wrappedValue: SearchViewModel(repository: repository, sessionStore: session))
        _projectsViewModel = StateObject(wrappedValue: ProjectsViewModel(repository: repository, sessionStore: session))
    }

    var body: some Scene {
        WindowGroup {
            RootTabView(
                todayViewModel: todayViewModel,
                upcomingViewModel: upcomingViewModel,
                searchViewModel: searchViewModel,
                projectsViewModel: projectsViewModel
            )
            .environmentObject(sessionStore)
        }
    }
}
