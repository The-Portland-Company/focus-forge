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
}

struct MobileTaskDTO: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let due_date: String?
    let due_time: String?
    let priority: Int
    let project_id: String?
    let completed: Bool
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
}

struct AppleExchangeRequest: Encodable {
    let identity_token: String
    let nonce: String?
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
