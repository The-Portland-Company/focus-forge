import Foundation
import SwiftData

@Model
final class CachedUser {
    @Attribute(.unique) var id: String
    var email: String
    var firstName: String
    var lastName: String

    init(id: String, email: String, firstName: String, lastName: String) {
        self.id = id
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
    }
}

@Model
final class CachedProject {
    @Attribute(.unique) var id: String
    var name: String
    var color: String

    init(id: String, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }
}

@Model
final class CachedTask {
    @Attribute(.unique) var id: String
    var name: String
    var taskDescription: String
    var dueDate: String
    var dueTime: String
    var priority: Int
    var projectID: String
    var completed: Bool
    var updatedAt: Date

    init(
        id: String,
        name: String,
        taskDescription: String,
        dueDate: String,
        dueTime: String,
        priority: Int,
        projectID: String,
        completed: Bool,
        updatedAt: Date
    ) {
        self.id = id
        self.name = name
        self.taskDescription = taskDescription
        self.dueDate = dueDate
        self.dueTime = dueTime
        self.priority = priority
        self.projectID = projectID
        self.completed = completed
        self.updatedAt = updatedAt
    }
}
