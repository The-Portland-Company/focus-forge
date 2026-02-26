import SwiftUI

struct ProjectsView: View {
    @ObservedObject var viewModel: ProjectsViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Projects") {
                    Picker("Project", selection: Binding(get: {
                        viewModel.selectedProjectID ?? ""
                    }, set: { newValue in
                        viewModel.selectedProjectID = newValue.isEmpty ? nil : newValue
                        Task { await viewModel.loadProjectTasks() }
                    })) {
                        ForEach(viewModel.projects) { project in
                            Text(project.name).tag(project.id)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Tasks") {
                    if viewModel.projectTasks.isEmpty {
                        Text("No tasks in this project")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(viewModel.projectTasks) { task in
                            TaskRowView(task: task, onToggle: {})
                        }
                    }
                }
            }
            .navigationTitle("Projects")
            .refreshable { await viewModel.loadProjects() }
            .overlay { if viewModel.isLoading { ProgressView() } }
            .task { await viewModel.loadProjects() }
        }
    }
}
