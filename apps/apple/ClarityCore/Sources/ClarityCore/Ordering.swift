import Foundation

// Manual list ordering. sortOrder (double, default 0) is the user's
// hand-placed position: lists sort by it first, so an untouched list (all
// zeros) falls back to priority order, and the first drag pins the order.
// New tasks arrive at 0 and therefore surface at the top until placed.
// Mirrors packages/shared/src/ordering.ts — keep the two and their test
// tables in sync.

/// The fields a reorder needs — satisfied by `TaskItem`.
public protocol Orderable {
    var id: UUID { get }
    var sortOrder: Double { get }
}

/// What the manual-order comparator reads — satisfied by `TaskItem`.
public protocol UserOrderable: Orderable, Prioritizable {
    var createdAt: Date { get }
}

extension TaskItem: UserOrderable {}

public struct OrderPatch: Equatable, Sendable {
    public let id: UUID
    public let sortOrder: Double

    public init(id: UUID, sortOrder: Double) {
        self.id = id
        self.sortOrder = sortOrder
    }
}

/// `sorted(by:)` predicate for manually orderable lists: sortOrder ascending,
/// ties broken by priority score (so unplaced tasks keep the leverage
/// ranking), then by creation time for stability.
public func userOrder<T: UserOrderable>(now: Date = Date()) -> (T, T) -> Bool {
    { a, b in
        if a.sortOrder != b.sortOrder { return a.sortOrder < b.sortOrder }
        let scoreA = priorityScore(a, now: now)
        let scoreB = priorityScore(b, now: now)
        if scoreA != scoreB { return scoreA > scoreB }
        return a.createdAt < b.createdAt
    }
}

/// Patches that persist moving `items[from]` to display position `to`.
/// When the new neighbours leave numeric room the moved item gets the
/// midpoint — a single write. When they don't (ties, e.g. a list that has
/// never been reordered), the whole list is renumbered 1..n, emitting patches
/// only for rows whose value changes.
public func reorderPatches(_ items: [some Orderable], from: Int, to: Int) -> [OrderPatch] {
    guard from != to, from >= 0, to >= 0, from < items.count, to < items.count else {
        return []
    }

    var next = items.map { (id: $0.id, sortOrder: $0.sortOrder) }
    let moved = next.remove(at: from)
    next.insert(moved, at: to)

    let prev = to > 0 ? next[to - 1].sortOrder : nil
    let succ = to < next.count - 1 ? next[to + 1].sortOrder : nil

    var value: Double?
    if prev == nil, let succ { value = succ - 1 }
    else if succ == nil, let prev { value = prev + 1 }
    else if let prev, let succ, prev < succ { value = prev + (succ - prev) / 2 }

    // Strict bounds guard against float underflow collapsing the midpoint
    // onto a neighbour.
    if let value,
        prev.map({ value > $0 }) ?? true,
        succ.map({ value < $0 }) ?? true
    {
        return [OrderPatch(id: moved.id, sortOrder: value)]
    }

    return next.enumerated().compactMap { index, item in
        item.sortOrder == Double(index + 1)
            ? nil
            : OrderPatch(id: item.id, sortOrder: Double(index + 1))
    }
}
