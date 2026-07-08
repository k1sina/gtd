import Foundation

// Collaboration rows: profiles, space membership, invites, task comments.
// Mirrors packages/shared/src/types.ts.

public struct Profile: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var email: String
    public var displayName: String
    public var createdAt: Date

    public init(id: UUID, email: String, displayName: String, createdAt: Date = Date()) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.createdAt = createdAt
    }
}

public enum SpaceRole: String, Codable, Sendable {
    case owner, member
}

public struct SpaceMember: Codable, Hashable, Sendable {
    public var spaceId: UUID
    public var userId: UUID
    public var role: SpaceRole
    public var createdAt: Date

    public init(spaceId: UUID, userId: UUID, role: SpaceRole, createdAt: Date = Date()) {
        self.spaceId = spaceId
        self.userId = userId
        self.role = role
        self.createdAt = createdAt
    }
}

public struct SpaceInvite: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var spaceId: UUID
    public var email: String
    public var token: UUID
    public var invitedBy: UUID
    public var createdAt: Date
    public var acceptedAt: Date?

    public init(
        id: UUID, spaceId: UUID, email: String, token: UUID, invitedBy: UUID,
        createdAt: Date = Date(), acceptedAt: Date? = nil
    ) {
        self.id = id
        self.spaceId = spaceId
        self.email = email
        self.token = token
        self.invitedBy = invitedBy
        self.createdAt = createdAt
        self.acceptedAt = acceptedAt
    }
}

public struct TaskComment: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var spaceId: UUID
    public var taskId: UUID
    public var userId: UUID
    public var body: String
    public var createdAt: Date

    public init(
        id: UUID, spaceId: UUID, taskId: UUID, userId: UUID, body: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.spaceId = spaceId
        self.taskId = taskId
        self.userId = userId
        self.body = body
        self.createdAt = createdAt
    }
}
