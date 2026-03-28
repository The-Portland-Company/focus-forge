import SwiftUI

struct TaskComposerSubmission {
    let name: String
    let description: String?
    let dueDate: String?
    let dueTime: String?
    let startDate: String?
    let startTime: String?
    let endDate: String?
    let endTime: String?
    let priority: Int
    let completed: Bool
    let projectID: String?
    let sectionID: String?
    let subtasks: [String]
}

struct TaskEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var taskDetailStore: TaskDetailStore

    @State private var name = ""
    @State private var details = ""
    @State private var dueDate = ""
    @State private var dueTime = ""
    @State private var startDate = ""
    @State private var startTime = ""
    @State private var endDate = ""
    @State private var endTime = ""
    @State private var priority = 4
    @State private var completed = false

    @State private var organizations: [BootstrapOrganization] = []
    @State private var projects: [BootstrapProject] = []
    @State private var taskLists: [MobileTaskListDTO] = []
    @State private var selectedOrganizationID = ""
    @State private var selectedProjectID = ""
    @State private var selectedTaskListID = ""

    @State private var subtasks: [String] = []
    @State private var newSubtaskName = ""

    @State private var creatingOrganizationName = ""
    @State private var creatingProjectName = ""
    @State private var creatingTaskListName = ""
    @State private var showingCreateOrganization = false
    @State private var showingCreateProject = false
    @State private var showingCreateTaskList = false
    @State private var isLoadingMeta = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    let onSave: (TaskComposerSubmission) async -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("Title", text: $name)
                    TextField("Description", text: $details, axis: .vertical)
                        .lineLimit(4...8)
                    Picker("Priority", selection: $priority) {
                        Text("P1").tag(1)
                        Text("P2").tag(2)
                        Text("P3").tag(3)
                        Text("P4").tag(4)
                    }
                    Toggle("Completed", isOn: $completed)
                }

                Section("Organization / Project / Task List") {
                    Picker("Organization", selection: $selectedOrganizationID) {
                        Text("Select Organization").tag("")
                        ForEach(organizations) { organization in
                            Text(organization.name).tag(organization.id)
                        }
                        Text("Add New Organization…").tag("__new_org__")
                    }
                    .onChange(of: selectedOrganizationID) { _, value in
                        if value == "__new_org__" {
                            selectedOrganizationID = organizations.first?.id ?? ""
                            creatingOrganizationName = ""
                            showingCreateOrganization = true
                        } else {
                            syncSelectedProject()
                        }
                    }

                    Picker("Project", selection: $selectedProjectID) {
                        Text("Select Project").tag("")
                        ForEach(filteredProjects) { project in
                            Text(project.name).tag(project.id)
                        }
                        Text("Add New Project…").tag("__new_project__")
                    }
                    .onChange(of: selectedProjectID) { _, value in
                        if value == "__new_project__" {
                            selectedProjectID = filteredProjects.first?.id ?? ""
                            creatingProjectName = ""
                            showingCreateProject = true
                        } else {
                            Task { await loadTaskLists() }
                        }
                    }

                    Picker("Task List", selection: $selectedTaskListID) {
                        Text("No Task List").tag("")
                        ForEach(taskLists) { list in
                            Text(list.name).tag(list.section_id ?? "")
                        }
                        Text("Add New Task List…").tag("__new_task_list__")
                    }
                    .onChange(of: selectedTaskListID) { _, value in
                        if value == "__new_task_list__" {
                            selectedTaskListID = taskLists.first?.section_id ?? ""
                            creatingTaskListName = ""
                            showingCreateTaskList = true
                        }
                    }
                }

                Section("Scheduling") {
                    TextField("Due Date (YYYY-MM-DD)", text: $dueDate)
                    TextField("Due Time (HH:MM)", text: $dueTime)
                    TextField("Start Date (YYYY-MM-DD)", text: $startDate)
                    TextField("Start Time (HH:MM)", text: $startTime)
                    TextField("End Date (YYYY-MM-DD)", text: $endDate)
                    TextField("End Time (HH:MM)", text: $endTime)
                }

                Section("Sub Tasks") {
                    if subtasks.isEmpty {
                        Text("No sub tasks added")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(subtasks.enumerated()), id: \.offset) { index, subtask in
                            HStack {
                                Text(subtask)
                                Spacer()
                                Button(role: .destructive) {
                                    subtasks.remove(at: index)
                                } label: {
                                    Image(systemName: "trash")
                                }
                            }
                        }
                    }

                    HStack {
                        TextField("Add sub task", text: $newSubtaskName)
                        Button("Add") {
                            let trimmed = newSubtaskName.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !trimmed.isEmpty else { return }
                            subtasks.append(trimmed)
                            newSubtaskName = ""
                        }
                        .disabled(newSubtaskName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .navigationTitle("New Task")
            .task { await loadMetadata() }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await saveTask() }
                    }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .overlay {
                if isLoadingMeta {
                    ProgressView()
                }
            }
            .alert("Create Organization", isPresented: $showingCreateOrganization) {
                TextField("Organization name", text: $creatingOrganizationName)
                Button("Cancel", role: .cancel) {}
                Button("Create") {
                    Task { await createOrganization() }
                }
            }
            .alert("Create Project", isPresented: $showingCreateProject) {
                TextField("Project name", text: $creatingProjectName)
                Button("Cancel", role: .cancel) {}
                Button("Create") {
                    Task { await createProject() }
                }
            }
            .alert("Create Task List", isPresented: $showingCreateTaskList) {
                TextField("Task list name", text: $creatingTaskListName)
                Button("Cancel", role: .cancel) {}
                Button("Create") {
                    Task { await createTaskList() }
                }
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
    }

    private var filteredProjects: [BootstrapProject] {
        if selectedOrganizationID.isEmpty {
            return projects
        }
        return projects.filter { $0.organization_id == selectedOrganizationID }
    }

    private func loadMetadata() async {
        isLoadingMeta = true
        defer { isLoadingMeta = false }

        do {
            async let loadedOrganizations = taskDetailStore.fetchOrganizations()
            async let loadedProjects = taskDetailStore.fetchProjects()
            organizations = try await loadedOrganizations
            projects = try await loadedProjects
            syncSelectedOrganization()
            syncSelectedProject()
            await loadTaskLists()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func syncSelectedOrganization() {
        if organizations.contains(where: { $0.id == selectedOrganizationID }) {
            return
        }
        selectedOrganizationID = organizations.first?.id ?? ""
    }

    private func syncSelectedProject() {
        if filteredProjects.contains(where: { $0.id == selectedProjectID }) {
            return
        }
        selectedProjectID = filteredProjects.first?.id ?? ""
    }

    private func loadTaskLists() async {
        guard !selectedProjectID.isEmpty else {
            taskLists = []
            selectedTaskListID = ""
            return
        }
        do {
            taskLists = try await taskDetailStore.fetchTaskLists(projectID: selectedProjectID)
            if !taskLists.contains(where: { ($0.section_id ?? "") == selectedTaskListID }) {
                selectedTaskListID = ""
            }
        } catch {
            taskLists = []
            selectedTaskListID = ""
            errorMessage = error.localizedDescription
        }
    }

    private func createOrganization() async {
        let trimmed = creatingOrganizationName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let created = try await taskDetailStore.createOrganization(name: trimmed)
            organizations.append(created)
            organizations.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            selectedOrganizationID = created.id
            syncSelectedProject()
            await loadTaskLists()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createProject() async {
        let trimmed = creatingProjectName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !selectedOrganizationID.isEmpty else { return }
        do {
            let created = try await taskDetailStore.createProject(
                name: trimmed,
                organizationID: selectedOrganizationID
            )
            projects.append(created)
            projects.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            selectedProjectID = created.id
            await loadTaskLists()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createTaskList() async {
        let trimmed = creatingTaskListName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !selectedProjectID.isEmpty else { return }
        do {
            let created = try await taskDetailStore.createTaskList(
                projectID: selectedProjectID,
                name: trimmed
            )
            taskLists.append(created)
            taskLists.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            selectedTaskListID = created.section_id ?? ""
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func saveTask() async {
        isSaving = true
        let submission = TaskComposerSubmission(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : details,
            dueDate: dueDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : dueDate,
            dueTime: dueTime.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : dueTime,
            startDate: startDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : startDate,
            startTime: startTime.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : startTime,
            endDate: endDate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : endDate,
            endTime: endTime.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : endTime,
            priority: priority,
            completed: completed,
            projectID: selectedProjectID.isEmpty ? nil : selectedProjectID,
            sectionID: selectedTaskListID.isEmpty ? nil : selectedTaskListID,
            subtasks: subtasks
        )
        await onSave(submission)
        isSaving = false
        dismiss()
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
