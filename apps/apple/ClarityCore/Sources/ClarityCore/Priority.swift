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
    /// Eliminate is (1, 1) — never (2, 2), which is the "unrated" sentinel.
    public var representativeValues: (urgency: Int, importance: Int) {
        switch self {
        case .doFirst: return (4, 4)
        case .schedule: return (2, 4)
        case .delegate: return (4, 2)
        case .eliminate: return (1, 1)
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

/// Steps per axis on the priority grid (values are 1...prioritySteps).
public let prioritySteps = 4

/// Map a point on the unit square (y measured DOWN, screen-style) to snapped
/// grid values. Out-of-range fractions clamp, so drags past the edge stick to
/// the border cells. x = urgency, y = importance (importance grows upward).
public func gridValueFromFraction(fx: Double, fy: Double) -> (urgency: Int, importance: Int) {
    func cell(_ f: Double) -> Int {
        // Clamp in Double space so extreme inputs can't overflow Int().
        let index = (f * Double(prioritySteps)).rounded(.down) + 1
        return Int(min(Double(prioritySteps), max(1, index)))
    }
    return (urgency: cell(fx), importance: cell(1 - fy))
}

/// Unit-square center (y down) of a grid cell, for placing the dot.
public func fractionFromGridValue(urgency: Int, importance: Int) -> (fx: Double, fy: Double) {
    (
        fx: (Double(urgency) - 0.5) / Double(prioritySteps),
        fy: 1 - (Double(importance) - 0.5) / Double(prioritySteps)
    )
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
