import SwiftUI

struct SearchView: View {
    @ObservedObject var viewModel: SearchViewModel

    var body: some View {
        NavigationStack {
            List {
                if viewModel.filtered.isEmpty && !viewModel.isLoading {
                    Section {
                        Text(viewModel.query.isEmpty ? "Type to search tasks" : "No matching tasks")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Results") {
                    ForEach(viewModel.filtered) { task in
                        TaskRowView(task: task, onToggle: {})
                    }
                }
            }
            .searchable(text: $viewModel.query, placement: .navigationBarDrawer(displayMode: .always))
            .navigationTitle("Search")
            .refreshable { await viewModel.load() }
            .overlay { if viewModel.isLoading { ProgressView() } }
            .task { await viewModel.load() }
        }
    }
}
