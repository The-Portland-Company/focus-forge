import SwiftUI

struct UpcomingView: View {
    @ObservedObject var viewModel: UpcomingViewModel

    var body: some View {
        NavigationStack {
            List {
                if viewModel.tasks.isEmpty && !viewModel.isLoading {
                    Section { Text("No upcoming tasks").foregroundStyle(.secondary) }
                }

                Section("Upcoming") {
                    ForEach(viewModel.tasks) { task in
                        TaskRowView(task: task) {
                            Task { await viewModel.toggleComplete(task) }
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await viewModel.deleteTask(task.id) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
            .navigationTitle("Upcoming")
            .refreshable { await viewModel.load() }
            .overlay { if viewModel.isLoading { ProgressView() } }
            .task { await viewModel.load() }
        }
    }
}
