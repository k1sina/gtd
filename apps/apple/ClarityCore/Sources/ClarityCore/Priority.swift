import Foundation

// Eisenhower prioritisation — mirrors packages/shared/src/priority.ts.
// Keep the two implementations in sync.

public enum Quadrant: String, Codable, Sendable {
    case doFirst = "do"
    case schedule
    case delegate
    case eliminate

    public var label: String {
        switch self {
        case .doFirst: return "Do first"
        case .schedule: return "Schedule"
        case .delegate: return "Delegate"
        case .eliminate: return "Eliminate"
        }
    }

    public var hint: String {
        switch self {
        case .doFirst: return "Urgent + important"
        case .schedule: return "Important, not urgent"
        case .delegate: return "Urgent, not important"
        case .eliminate: return "Neither"
        }
    }

    /// Urgency/importance written to a task dropped into this quadrant on the
    /// priority matrix. Mirrors QUADRANT_VALUES in the web matrix page.
    public var representativeValues: (urgency: Int, importance: Int) {
        switch self {
        case .doFirst: return (4, 4)
        case .schedule: return (2, 4)
        case .delegate: return (4, 2)
        case .eliminate: return (2, 2)
        }
    }
}

public let highThreshold = 3 // 3..4 counts as "high" on either axis

public func quadrant(urgency: Int, importance: Int) -> Quadrant {
    let urgent = urgency >= highThreshold
    let important = importance >= highThreshold
    switch (urgent, important) {
    case (true, true): return .doFirst
    case (false, true): return .schedule
    case (true, false): return .delegate
    case (false, false): return .eliminate
    }
}

public protocol Prioritizable {
    var urgency: Int { get }
    var importance: Int { get }
    var dueAt: Date? { get }
    var deferUntil: Date? { get }
}

/// Higher = more pressing. Importance dominates urgency; an approaching or
/// overdue due date adds a boost. Identical weights to the TypeScript version.
public func priorityScore(_ task: some Prioritizable, now: Date = Date()) -> Double {
    var score = Double(task.importance * 10 + task.urgency * 5)
    if let due = task.dueAt {
        let days = due.timeIntervalSince(now) / 86_400
        if days < 0 { score += 30 }
        else if days < 1 { score += 20 }
        else if days < 3 { score += 10 }
        else if days < 7 { score += 5 }
    }
    return score
}

public func isDeferred(_ task: some Prioritizable, now: Date = Date()) -> Bool {
    guard let deferUntil = task.deferUntil else { return false }
    return deferUntil > now
}
