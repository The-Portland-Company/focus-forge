import SwiftUI

struct TaskEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var details = ""

    let onSave: (String, String?) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("Title", text: $name)
                    TextField("Description", text: $details, axis: .vertical)
                        .lineLimit(4...8)
                }
            }
            .navigationTitle("New Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(name, details.isEmpty ? nil : details)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct TaskDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var taskDetailStore: TaskDetailStore

    let initialTask: MobileTaskDTO
    let onTaskChanged: (MobileTaskDTO) -> Void
    let onTaskDeleted: (String) -> Void

    @State private var name: String
    @State private var details: String
    @State private var dueDate: String
    @State private var dueTime: String
    @State private var sectionID: String
    @State private var priority: Int
    @State private var completed: Bool
    @State private var comments: [MobileCommentDTO] = []
    @State private var newComment = ""
    @State private var isLoadingComments = false
    @State private var isSaving = false
    @State private var isPostingComment = false
    @State private var showingDeleteConfirm = false
    @State private var errorMessage: String?

    init(
        task: MobileTaskDTO,
        onTaskChanged: @escaping (MobileTaskDTO) -> Void,
        onTaskDeleted: @escaping (String) -> Void
    ) {
        self.initialTask = task
        self.onTaskChanged = onTaskChanged
        self.onTaskDeleted = onTaskDeleted
        _name = State(initialValue: task.name)
        _details = State(initialValue: task.description ?? "")
        _dueDate = State(initialValue: task.due_date ?? "")
        _dueTime = State(initialValue: task.due_time ?? "")
        _sectionID = State(initialValue: task.section_id ?? "")
        _priority = State(initialValue: task.priority)
        _completed = State(initialValue: task.completed)
    }

    var body: some View {
        Form {
            Section("Task Details") {
                TextField("Title", text: $name)
                TextField("Description", text: $details, axis: .vertical)
                    .lineLimit(4...10)
                TextField("Due Date (YYYY-MM-DD)", text: $dueDate)
                TextField("Due Time (HH:MM)", text: $dueTime)
                TextField("Section ID", text: $sectionID)

                Picker("Priority", selection: $priority) {
                    Text("P1").tag(1)
                    Text("P2").tag(2)
                    Text("P3").tag(3)
                    Text("P4").tag(4)
                }

                Toggle("Completed", isOn: $completed)

                if let projectID = initialTask.project_id, !projectID.isEmpty {
                    LabeledContent("Project ID", value: projectID)
                        .font(.caption)
                }
                LabeledContent("Task ID", value: initialTask.id)
                    .font(.caption)
            }

            Section("Comments") {
                if isLoadingComments {
                    ProgressView()
                } else if comments.isEmpty {
                    Text("No comments yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(comments) { comment in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(comment.content)
                            HStack {
                                Text(comment.user_id ?? "Unknown user")
                                Spacer()
                                Text(formattedTimestamp(comment.created_at))
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }

                TextField("Add a comment", text: $newComment, axis: .vertical)
                    .lineLimit(2...6)

                Button {
                    Task { await postComment() }
                } label: {
                    HStack {
                        Image(systemName: "paperplane.fill")
                        Text("Post Comment")
                    }
                }
                .disabled(isPostingComment || newComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            Section {
                Button(role: .destructive) {
                    showingDeleteConfirm = true
                } label: {
                    Label("Delete Task", systemImage: "trash")
                }
            }
        }
        .navigationTitle("Task")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task { await saveTask() }
                }
                .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .task { await loadComments() }
        .alert("Delete Task?", isPresented: $showingDeleteConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await deleteTask() }
            }
        } message: {
            Text("This action cannot be undone.")
        }
        .alert("Error", isPresented: Binding(get: {
            errorMessage != nil
        }, set: { newValue in
            if !newValue { errorMessage = nil }
        })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func saveTask() async {
        isSaving = true
        defer { isSaving = false }

        do {
            let updated = try await taskDetailStore.updateTask(
                taskID: initialTask.id,
                request: PatchTaskRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : details,
                    due_date: dueDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : dueDate,
                    due_time: dueTime.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : dueTime,
                    priority: priority,
                    completed: completed,
                    section_id: sectionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : sectionID
                )
            )
            onTaskChanged(updated)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadComments() async {
        isLoadingComments = true
        defer { isLoadingComments = false }
        do {
            comments = try await taskDetailStore.fetchTaskComments(taskID: initialTask.id)
            errorMessage = nil
        } catch {
            comments = []
            errorMessage = error.localizedDescription
        }
    }

    private func postComment() async {
        let trimmed = newComment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isPostingComment = true
        defer { isPostingComment = false }

        do {
            let created = try await taskDetailStore.createTaskComment(
                taskID: initialTask.id,
                projectID: initialTask.project_id,
                content: trimmed
            )
            comments.insert(created, at: 0)
            newComment = ""
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteTask() async {
        do {
            try await taskDetailStore.deleteTask(taskID: initialTask.id)
            onTaskDeleted(initialTask.id)
            dismiss()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func formattedTimestamp(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "" }
        let parser = ISO8601DateFormatter()
        if let date = parser.date(from: value) {
            return DateFormatter.localizedString(from: date, dateStyle: .medium, timeStyle: .short)
        }
        return value
    }
}
