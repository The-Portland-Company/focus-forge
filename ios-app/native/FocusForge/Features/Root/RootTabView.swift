import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @ObservedObject var todayViewModel: TodayViewModel
    @ObservedObject var upcomingViewModel: UpcomingViewModel
    @ObservedObject var searchViewModel: SearchViewModel
    @ObservedObject var projectsViewModel: ProjectsViewModel

    var body: some View {
        Group {
            if sessionStore.isAuthenticated {
                TabView {
                    TodayView(viewModel: todayViewModel)
                        .tabItem {
                            Label("Today", systemImage: "sun.max")
                        }

                    UpcomingView(viewModel: upcomingViewModel)
                        .tabItem {
                            Label("Upcoming", systemImage: "calendar")
                        }

                    SearchView(viewModel: searchViewModel)
                        .tabItem {
                            Label("Search", systemImage: "magnifyingglass")
                        }

                    ProjectsView(viewModel: projectsViewModel)
                        .tabItem {
                            Label("Organizations", systemImage: "building.2")
                        }
                }
            } else {
                SignInView()
            }
        }
        .task {
            // Only attempt refresh during cold start restore from keychain.
            // Avoid refreshing immediately after successful sign-in.
            guard !sessionStore.isAuthenticated, sessionStore.refreshToken != nil else { return }
            await sessionStore.refreshIfNeeded()
        }
    }
}
