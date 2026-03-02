import Foundation

struct APIEnvelope<T: Decodable>: Decodable {
    let data: T?
    let meta: [String: JSONValue]?
    let error: APIErrorPayload?
}

struct APIErrorPayload: Decodable {
    let code: String
    let message: String
}

enum JSONValue: Decodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) { self = .string(value); return }
        if let value = try? container.decode(Int.self) { self = .int(value); return }
        if let value = try? container.decode(Double.self) { self = .double(value); return }
        if let value = try? container.decode(Bool.self) { self = .bool(value); return }
        self = .string("")
    }
}

struct EmptyPayload: Decodable {}

struct MobileSessionPayload: Codable {
    let access_token: String
    let refresh_token: String
    let token_type: String?
    let expires_in: Int?
    let expires_at: Int?
    let user: MobileUserDTO
}

struct MobileUserDTO: Codable, Identifiable {
    let id: String
    let email: String?
}

struct BootstrapPayload: Decodable {
    let user: BootstrapUser
    let organizations: [BootstrapOrganization]
    let projects: [BootstrapProject]
    let tasks: [MobileTaskDTO]
}

struct BootstrapUser: Decodable {
    let id: String
    let email: String?
    let firstName: String?
    let lastName: String?
    let profileColor: String?
}

struct BootstrapOrganization: Decodable, Identifiable {
    let id: String
    let name: String
    let color: String?
}

struct BootstrapProject: Decodable, Identifiable {
    let id: String
    let name: String
    let color: String?
    let organization_id: String?
}

struct MobileTaskDTO: Decodable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let due_date: String?
    let due_time: String?
    let priority: Int
    let project_id: String?
    let section_id: String?
    let completed: Bool

    init(
        id: String,
        name: String,
        description: String?,
        due_date: String?,
        due_time: String?,
        priority: Int,
        project_id: String?,
        section_id: String?,
        completed: Bool
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.due_date = due_date
        self.due_time = due_time
        self.priority = priority
        self.project_id = project_id
        self.section_id = section_id
        self.completed = completed
    }

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case due_date
        case dueDate
        case due_time
        case dueTime
        case priority
        case project_id
        case projectId
        case section_id
        case sectionId
        case completed
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let idString = try? container.decode(String.self, forKey: .id) {
            id = idString
        } else if let idInt = try? container.decode(Int.self, forKey: .id) {
            id = String(idInt)
        } else {
            id = UUID().uuidString
        }

        if let nameString = try? container.decode(String.self, forKey: .name) {
            name = nameString
        } else {
            name = ""
        }

        description = try container.decodeIfPresent(String.self, forKey: .description)
        due_date = try container.decodeIfPresent(String.self, forKey: .due_date)
            ?? container.decodeIfPresent(String.self, forKey: .dueDate)
        due_time = try container.decodeIfPresent(String.self, forKey: .due_time)
            ?? container.decodeIfPresent(String.self, forKey: .dueTime)

        if let priorityInt = try? container.decode(Int.self, forKey: .priority) {
            priority = priorityInt
        } else if let priorityString = try? container.decode(String.self, forKey: .priority),
                  let parsedPriority = Int(priorityString.trimmingCharacters(in: .whitespacesAndNewlines)) {
            priority = parsedPriority
        } else {
            priority = 4
        }

        project_id = try container.decodeIfPresent(String.self, forKey: .project_id)
            ?? container.decodeIfPresent(String.self, forKey: .projectId)
        section_id = try container.decodeIfPresent(String.self, forKey: .section_id)
            ?? container.decodeIfPresent(String.self, forKey: .sectionId)

        if let completedBool = try? container.decode(Bool.self, forKey: .completed) {
            completed = completedBool
        } else if let completedInt = try? container.decode(Int.self, forKey: .completed) {
            completed = completedInt != 0
        } else if let completedString = try? container.decode(String.self, forKey: .completed) {
            let normalized = completedString.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            completed = normalized == "true" || normalized == "1" || normalized == "yes"
        } else {
            completed = false
        }
    }
}

struct CreateTaskRequest: Encodable {
    let name: String
    let description: String?
    let due_date: String?
    let due_time: String?
    let priority: Int
    let project_id: String?
}

struct PatchTaskRequest: Encodable {
    let name: String?
    let description: String?
    let due_date: String?
    let due_time: String?
    let priority: Int?
    let completed: Bool?
    let section_id: String?

    init(
        name: String? = nil,
        description: String? = nil,
        due_date: String? = nil,
        due_time: String? = nil,
        priority: Int? = nil,
        completed: Bool? = nil,
        section_id: String? = nil
    ) {
        self.name = name
        self.description = description
        self.due_date = due_date
        self.due_time = due_time
        self.priority = priority
        self.completed = completed
        self.section_id = section_id
    }
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct RefreshRequest: Encodable {
    let refresh_token: String
}

struct LinkVerifyRequest: Encodable {
    let email: String
    let password: String
}

struct LinkPreviewUser: Decodable {
    let id: String
    let email: String
}

struct LinkPreviewSummary: Decodable {
    let organization_memberships: Int
    let projects_in_scope: Int?
    let assigned_tasks: Int
}

struct LinkVerifyPayload: Decodable {
    let link_token: String
    let source_user: LinkPreviewUser
    let preview: LinkPreviewSummary
}

struct LinkCompleteRequest: Encodable {
    let link_token: String
    let transfer_task_ownership: Bool
}

struct LinkCompletePayload: Decodable {
    let source_user_id: String
    let target_user_id: String
    let memberships_added: Int
    let tasks_transferred: Int
    let transfer_task_ownership: Bool
}

struct MobileTaskListDTO: Decodable, Identifiable {
    let id: String
    let section_id: String?
    let name: String
    let task_count: Int
}

struct CreateTaskListRequest: Encodable {
    let name: String
}
