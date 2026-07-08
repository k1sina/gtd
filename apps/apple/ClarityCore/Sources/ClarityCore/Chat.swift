import Foundation

// AI-assistant chat rows. `chat_messages.content` is a jsonb array of Claude
// content blocks (text / tool_use / tool_result / thinking / …); decoding is
// lenient so unknown block types never fail a whole conversation.

public struct ChatSession: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var userId: UUID
    public var title: String
    public var createdAt: Date
    public var updatedAt: Date

    public init(id: UUID, userId: UUID, title: String, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id
        self.userId = userId
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum ChatBlock: Hashable, Sendable {
    case text(String)
    case toolUse(name: String)
    case toolResult
    case unknown(type: String)
}

extension ChatBlock: Codable {
    private enum CodingKeys: String, CodingKey {
        case type, text, name
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = (try? container.decode(String.self, forKey: .type)) ?? ""
        switch type {
        case "text":
            self = .text((try? container.decode(String.self, forKey: .text)) ?? "")
        case "tool_use":
            self = .toolUse(name: (try? container.decode(String.self, forKey: .name)) ?? "tool")
        case "tool_result":
            self = .toolResult
        default:
            self = .unknown(type: type)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let text):
            try container.encode("text", forKey: .type)
            try container.encode(text, forKey: .text)
        case .toolUse(let name):
            try container.encode("tool_use", forKey: .type)
            try container.encode(name, forKey: .name)
        case .toolResult:
            try container.encode("tool_result", forKey: .type)
        case .unknown(let type):
            try container.encode(type, forKey: .type)
        }
    }
}

public struct ChatMessage: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var sessionId: UUID
    public var role: String
    public var content: [ChatBlock]
    public var createdAt: Date

    public init(id: UUID, sessionId: UUID, role: String, content: [ChatBlock], createdAt: Date = Date()) {
        self.id = id
        self.sessionId = sessionId
        self.role = role
        self.content = content
        self.createdAt = createdAt
    }

    /// Concatenated text of all text blocks — what the UI renders as the bubble.
    public var text: String {
        content.compactMap {
            if case .text(let t) = $0 { return t } else { return nil }
        }.joined(separator: "\n\n")
    }

    /// Names of tools the assistant used in this message (shown as captions).
    public var toolNames: [String] {
        content.compactMap {
            if case .toolUse(let name) = $0 { return name } else { return nil }
        }
    }
}
