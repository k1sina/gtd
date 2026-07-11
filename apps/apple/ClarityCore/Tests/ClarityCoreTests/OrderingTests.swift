import Foundation
import Testing
@testable import ClarityCore

// Mirrors packages/shared/test/ordering.test.ts — keep the tables in sync.

private struct Row: Orderable {
    let id: UUID
    let sortOrder: Double
}

/// t0, t1, … with the given sort orders, like the TS `items(...)` helper.
private func rows(_ orders: Double...) -> [Row] {
    orders.enumerated().map { Row(id: uuid($0.offset), sortOrder: $0.element) }
}

private func uuid(_ n: Int) -> UUID {
    UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", n))!
}

private func task(
    title: String,
    sortOrder: Double = 0,
    urgency: Int = 2,
    importance: Int = 2,
    createdAt: Date = date("2026-07-01T00:00:00")
) -> TaskItem {
    TaskItem(
        id: UUID(), spaceId: UUID(), createdBy: UUID(), title: title,
        urgency: urgency, importance: importance,
        sortOrder: sortOrder, createdAt: createdAt)
}

@Suite struct OrderingTests {
    let now = date("2026-07-11T12:00:00")

    // MARK: userOrder

    @Test func sortsBySortOrderFirstRegardlessOfPriority() {
        let list = [
            task(title: "low", sortOrder: 2, urgency: 4, importance: 4),
            task(title: "high", sortOrder: 1, urgency: 1, importance: 1),
        ]
        #expect(list.sorted(by: userOrder(now: now)).map(\.title) == ["high", "low"])
    }

    @Test func breaksTiesByPriorityThenCreatedAt() {
        let list = [
            task(title: "older", createdAt: date("2026-06-01T00:00:00")),
            task(title: "newer", createdAt: date("2026-06-02T00:00:00")),
            task(title: "important", importance: 4),
        ]
        #expect(
            list.sorted(by: userOrder(now: now)).map(\.title)
                == ["important", "older", "newer"])
    }

    @Test func unplacedZeroSortsAboveRenumberedList() {
        let list = [
            task(title: "placed", sortOrder: 1),
            task(title: "fresh", sortOrder: 0),
        ]
        #expect(list.sorted(by: userOrder(now: now)).map(\.title) == ["fresh", "placed"])
    }

    // MARK: reorderPatches

    @Test func noPatchesForNoOpOrOutOfRangeMove() {
        #expect(reorderPatches(rows(1, 2, 3), from: 1, to: 1).isEmpty)
        #expect(reorderPatches(rows(1, 2, 3), from: -1, to: 2).isEmpty)
        #expect(reorderPatches(rows(1, 2, 3), from: 0, to: 3).isEmpty)
        #expect(reorderPatches([Row](), from: 0, to: 0).isEmpty)
    }

    @Test func writesMidpointWhenNeighboursLeaveRoom() {
        #expect(
            reorderPatches(rows(1, 2, 3, 4), from: 0, to: 2)
                == [OrderPatch(id: uuid(0), sortOrder: 3.5)])
    }

    @Test func movesToTopWithNeighbourMinusOne() {
        #expect(
            reorderPatches(rows(1, 2, 3), from: 2, to: 0)
                == [OrderPatch(id: uuid(2), sortOrder: 0)])
    }

    @Test func movesToBottomWithNeighbourPlusOne() {
        #expect(
            reorderPatches(rows(1, 2, 3), from: 0, to: 2)
                == [OrderPatch(id: uuid(0), sortOrder: 4)])
    }

    @Test func movingToTopOfNeverOrderedListNeedsOneWrite() {
        #expect(
            reorderPatches(rows(0, 0, 0), from: 2, to: 0)
                == [OrderPatch(id: uuid(2), sortOrder: -1)])
    }

    @Test func midpointBetweenDuplicatedValuesWorksWhenRoom() {
        #expect(
            reorderPatches(rows(1, 2, 2, 4), from: 3, to: 1)
                == [OrderPatch(id: uuid(3), sortOrder: 1.5)])
    }

    @Test func renumberEmitsPatchesOnlyForRowsThatChange() {
        #expect(
            reorderPatches(rows(1, 2, 2, 4), from: 0, to: 1) == [
                OrderPatch(id: uuid(1), sortOrder: 1),
                OrderPatch(id: uuid(0), sortOrder: 2),
                OrderPatch(id: uuid(2), sortOrder: 3),
            ])
    }

    @Test func movingBetweenTieRenumbersDisplayedOrder() {
        #expect(
            reorderPatches(rows(5, 5, 5), from: 0, to: 1) == [
                OrderPatch(id: uuid(1), sortOrder: 1),
                OrderPatch(id: uuid(0), sortOrder: 2),
                OrderPatch(id: uuid(2), sortOrder: 3),
            ])
    }

    @Test func singleWriteResultsKeepOtherRowsUntouched() {
        #expect(
            reorderPatches(rows(10, 20, 30, 40), from: 3, to: 1)
                == [OrderPatch(id: uuid(3), sortOrder: 15)])
    }
}
