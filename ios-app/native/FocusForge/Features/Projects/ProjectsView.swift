import SwiftUI
import UniformTypeIdentifiers

struct ProjectsView: View {
    @ObservedObject var viewModel: ProjectsViewModel

    var body: some View {
        NavigationStack {
            List {
                if viewModel.organizations.isEmpty && !viewModel.isLoading {
                    Section {
                        Text("No organizations available")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Organizations") {
                    ForEach(viewModel.organizations) { organization in
                        NavigationLink {
                            ProjectsByOrganizationView(
                                organization: organization,
                                viewModel: viewModel
                            )
                        } label: {
                            HStack {
                                Text(organization.name)
                                Spacer()
                                if viewModel.isLoading {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Text("\(viewModel.projects(for: organization.id).count)")
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Organizations")
            .refreshable { await viewModel.loadOrganizations() }
            .task { await viewModel.loadOrganizations() }
            .alert("Error", isPresented: Binding(get: {
                viewModel.errorMessage != nil
            }, set: { newValue in
                if !newValue { viewModel.errorMessage = nil }
            })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }
}

private struct ProjectsByOrganizationView: View {
    let organization: BootstrapOrganization
    @ObservedObject var viewModel: ProjectsViewModel

    var body: some View {
        List {
            let projects = viewModel.projects(for: organization.id)
            if projects.isEmpty {
                Text("No projects in this organization")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(projects) { project in
                    NavigationLink {
                        ProjectTaskListsView(project: project, viewModel: viewModel)
                    } label: {
                        HStack {
                            Text(project.name)
                            Spacer()
                            if viewModel.areProjectCountsLoaded {
                                Text("\(viewModel.taskCount(for: project.id))")
                                    .foregroundStyle(.secondary)
                            } else {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(organization.name)
    }
}

private struct ProjectTaskListsView: View {
    let project: BootstrapProject
    @ObservedObject var viewModel: ProjectsViewModel
    @State private var showingAddTaskList = false
    @State private var newTaskListName = ""

    var body: some View {
        List {
            if viewModel.displayedTaskLists.isEmpty && !viewModel.isLoading {
                Text("No task lists in this project")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.displayedTaskLists) { taskList in
                    let tasks = viewModel.tasks(for: taskList)

                    Section {
                        if tasks.isEmpty {
                            Text("Drop task here")
                                .foregroundStyle(.secondary)
                                .font(.caption)
                        } else {
                            ForEach(tasks) { task in
                                TaskRowView(task: task) { }
                                    .onDrag {
                                        NSItemProvider(object: NSString(string: task.id))
                                    }
                            }
                        }
                    } header: {
                        HStack {
                            Text(taskList.name)
                            Spacer()
                            Text("\(tasks.count)")
                                .foregroundStyle(.secondary)
                                .font(.caption)
                        }
                    }
                    .onDrop(of: [UTType.text], isTargeted: nil) { providers in
                        handleDrop(providers: providers, into: taskList)
                    }
                }
            }
        }
        .navigationTitle(project.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    newTaskListName = ""
                    showingAddTaskList = true
                } label: {
                    Image(systemName: "text.badge.plus")
                }
            }
        }
        .task {
            await viewModel.loadTaskLists(projectID: project.id)
        }
        .alert("Add Task List", isPresented: $showingAddTaskList) {
            TextField("Task list name", text: $newTaskListName)
            Button("Cancel", role: .cancel) {}
            Button("Add") {
                Task {
                    await viewModel.createTaskList(
                        projectID: project.id,
                        name: newTaskListName
                    )
                }
            }
        } message: {
            Text("Create a new task list for this project.")
        }
    }

    private func handleDrop(providers: [NSItemProvider], into taskList: MobileTaskListDTO) -> Bool {
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.text.identifier) }) else {
            return false
        }

        provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
            let taskID: String?
            if let data = item as? Data {
                taskID = String(data: data, encoding: .utf8)
            } else if let string = item as? String {
                taskID = string
            } else if let nsString = item as? NSString {
                taskID = nsString as String
            } else {
                taskID = nil
            }

            guard let taskID, !taskID.isEmpty else { return }
            Task {
                await viewModel.moveTask(taskID: taskID, to: taskList, projectID: project.id)
            }
        }

        return true
    }
}
