import SwiftUI

struct TaskRowView: View {
    let task: MobileTaskDTO
    let metadataLine: String?
    let onToggle: () -> Void

    init(task: MobileTaskDTO, metadataLine: String? = nil, onToggle: @escaping () -> Void) {
        self.task = task
        self.metadataLine = metadataLine
        self.onToggle = onToggle
    }

    private var dueLabel: String {
        guard let dueDate = task.due_date, !dueDate.isEmpty else { return "No due date" }
        if let dueTime = task.due_time, !dueTime.isEmpty {
            return "\(dueDate) \(dueTime)"
        }
        return dueDate
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Button(action: onToggle) {
                    Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(task.completed ? .green : .secondary)
                }
                .buttonStyle(.plain)

                Text(task.name)
                    .font(.body)
                    .foregroundStyle(task.completed ? .secondary : .primary)
                    .strikethrough(task.completed)
                    .lineLimit(2)

                Spacer(minLength: 8)
                PriorityBadgeView(priority: task.priority)
            }

            if let metadataLine, !metadataLine.isEmpty {
                Text(metadataLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                Text(dueLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if let description = task.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

struct PriorityBadgeView: View {
    let priority: Int

    private var color: Color {
        switch priority {
        case 1: return .red
        case 2: return .orange
        case 3: return .blue
        default: return .gray
        }
    }

    var body: some View {
        Label("P\(priority)", systemImage: "flag.fill")
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}
