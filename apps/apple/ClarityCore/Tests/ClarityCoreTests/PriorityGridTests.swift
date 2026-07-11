import Testing

@testable import ClarityCore

// Mirrors the "priority grid" cases in packages/shared/test/priority.test.ts.
// Keep the value tables identical.
@Suite struct PriorityGridTests {
    @Test func mapsCornersToExtremeCells() {
        #expect(gridValueFromFraction(fx: 0, fy: 0) == (1, 4))
        #expect(gridValueFromFraction(fx: 0.999, fy: 0) == (4, 4))
        #expect(gridValueFromFraction(fx: 0, fy: 0.999) == (1, 1))
        #expect(gridValueFromFraction(fx: 0.999, fy: 0.999) == (4, 1))
    }

    @Test func deadCenterLandsInDo() {
        #expect(gridValueFromFraction(fx: 0.5, fy: 0.5) == (3, 3))
    }

    @Test func boundaryFractionsFallIntoUpperCell() {
        #expect(gridValueFromFraction(fx: 0.25, fy: 0.5).urgency == 2)
        #expect(gridValueFromFraction(fx: 0.5, fy: 0.5).urgency == 3)
        #expect(gridValueFromFraction(fx: 0.75, fy: 0.5).urgency == 4)
    }

    @Test func clampsOutOfRangeFractions() {
        #expect(gridValueFromFraction(fx: -1, fy: 2) == (1, 1))
        #expect(gridValueFromFraction(fx: 2, fy: -1) == (4, 4))
        #expect(gridValueFromFraction(fx: 1, fy: 1) == (4, 1))
    }

    @Test func roundtripsEveryGridValueThroughCellCenter() {
        for u in 1...4 {
            for i in 1...4 {
                let f = fractionFromGridValue(urgency: u, importance: i)
                #expect(f.fx >= 0 && f.fx <= 1)
                #expect(f.fy >= 0 && f.fy <= 1)
                #expect(gridValueFromFraction(fx: f.fx, fy: f.fy) == (u, i))
            }
        }
    }
}
