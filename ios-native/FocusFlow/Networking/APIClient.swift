import Foundation

final class APIClient {
    enum APIError: LocalizedError {
        case invalidURL
        case unauthorized
        case decodingError
        case serverError(String)
        case unknown

        var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid API URL"
            case .unauthorized: return "Unauthorized"
            case .decodingError: return "Response parsing failed"
            case .serverError(let message): return message
            case .unknown: return "Unknown API error"
            }
        }
    }

    private let baseURL: URL
    private let session: URLSession

    init(baseURLString: String = "https://focusflow.theportlandcompany.com") {
        self.baseURL = URL(string: baseURLString)!
        self.session = URLSession(configuration: .default)
    }

    func request<T: Decodable>(
        path: String,
        method: String = "GET",
        accessToken: String? = nil,
        body: Encodable? = nil,
        responseType: T.Type
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.unknown
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 { throw APIError.unauthorized }
            let envelope = try? JSONDecoder().decode(APIEnvelope<EmptyPayload>.self, from: data)
            let rawBody = String(data: data, encoding: .utf8) ?? ""
            let code = envelope?.error?.code ?? "http_\(httpResponse.statusCode)"
            let message = envelope?.error?.message ?? "Request failed with status \(httpResponse.statusCode)"
            let composed = "\(code): \(message)\(rawBody.isEmpty ? "" : " | body=\(rawBody)")"
            throw APIError.serverError(composed)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError
        }
    }
}

struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init<T: Encodable>(_ wrapped: T) {
        _encode = wrapped.encode
    }
    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
