import SwiftUI

struct TodayView: View {
    @ObservedObject var viewModel: TodayViewModel
    @EnvironmentObject private var sessionStore: SessionStore
    @State private var showingAccountLink = false

    var body: some View {
        NavigationStack {
            List {
                if viewModel.visibleTasks.isEmpty && !viewModel.isLoading {
                    Section {
                        Text(emptyStateMessage)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Overdue & Today") {
                    ForEach(viewModel.visibleTasks) { task in
                        NavigationLink {
                            TaskDetailView(task: task) { updated in
                                viewModel.applyTaskUpdate(updated)
                            } onTaskDeleted: { taskID in
                                viewModel.removeTask(taskID)
                            }
                        } label: {
                            TaskRowView(task: task) {
                                Task { await viewModel.toggleComplete(task) }
                            }
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await viewModel.deleteTask(taskID: task.id) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .leading) {
                            Button {
                                Task {
                                    await viewModel.updateTask(
                                        taskID: task.id,
                                        patch: PatchTaskRequest(
                                            name: task.name,
                                            description: task.description,
                                            due_date: task.due_date,
                                            due_time: task.due_time,
                                            priority: task.priority == 1 ? 4 : task.priority - 1,
                                            completed: task.completed,
                                            section_id: task.section_id
                                        )
                                    )
                                }
                            } label: {
                                Label("Priority", systemImage: "flag")
                            }
                            .tint(.orange)
                        }
                    }
                }
            }
            .refreshable {
                await viewModel.refresh()
            }
            .navigationTitle("Today")
            .searchable(text: $viewModel.searchQuery, placement: .navigationBarDrawer(displayMode: .always))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        Menu {
                            Picker("Sort", selection: $viewModel.sortOption) {
                                ForEach(TodayViewModel.SortOption.allCases) { option in
                                    Text(option.rawValue).tag(option)
                                }
                            }
                            Picker("Filter", selection: $viewModel.filterOption) {
                                ForEach(TodayViewModel.FilterOption.allCases) { option in
                                    Text(option.rawValue).tag(option)
                                }
                            }
                        } label: {
                            Image(systemName: "line.3.horizontal.decrease.circle")
                        }

                        Button {
                            viewModel.showingTaskEditor = true
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("Link Existing Account") {
                            showingAccountLink = true
                        }
                        Button("Logout", role: .destructive) {
                            Task { await sessionStore.logout() }
                        }
                    } label: {
                        Image(systemName: "person.crop.circle")
                    }
                }
            }
            .overlay {
                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .task {
                await viewModel.loadInitial()
            }
            .sheet(isPresented: $viewModel.showingTaskEditor) {
                TaskEditorView { name, description in
                    Task { await viewModel.createTask(name: name, description: description) }
                }
            }
            .sheet(isPresented: $showingAccountLink) {
                AccountLinkView {
                    await viewModel.loadInitial()
                }
            }
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

    private var emptyStateMessage: String {
        if !viewModel.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "No matching tasks"
        }
        return "No tasks for current filter"
    }
}
