import ClarityCore
import Foundation
import Testing
@testable import ClarityKit

@Suite struct DecodingTests {
    @Test func decodesTaskRowWithMicrosecondTimestamps() throws {
        let json = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000001",
              "space_id": "6f1b2a34-0000-4000-8000-000000000002",
              "project_id": null,
              "parent_task_id": null,
              "created_by": "6f1b2a34-0000-4000-8000-000000000003",
              "assigned_to": null,
              "title": "Water plants",
              "notes": "Back porch too",
              "status": "next",
              "urgency": 3,
              "importance": 2,
              "due_at": "2026-07-08T15:00:00+00:00",
              "defer_until": null,
              "estimated_minutes": 15,
              "energy": "low",
              "context_tags": ["home"],
              "waiting_on": null,
              "recurrence_rule": "FREQ=DAILY;INTERVAL=3",
              "recurrence_parent_id": null,
              "sort_order": 1.5,
              "completed_at": null,
              "created_at": "2026-07-07T14:42:17.793486+00:00",
              "updated_at": "2026-07-07T14:42:17.793486+00:00",
              "search": "'plant':2 'water':1"
            }
            """.data(using: .utf8)!
        let task = try PostgrestJSON.decoder.decode(TaskItem.self, from: json)
        #expect(task.title == "Water plants")
        #expect(task.energy == .low)
        #expect(task.contextTags == ["home"])
        #expect(task.recurrenceRule == "FREQ=DAILY;INTERVAL=3")
        #expect(task.sortOrder == 1.5)
        // Microsecond fraction parsed (would throw otherwise) and roughly sane.
        #expect(task.createdAt.timeIntervalSince1970 > 1_700_000_000)
    }

    @Test func decodesHabitAndLog() throws {
        let habitJSON = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000010",
              "space_id": "6f1b2a34-0000-4000-8000-000000000002",
              "created_by": "6f1b2a34-0000-4000-8000-000000000003",
              "name": "Stretch",
              "weekdays": [0, 2, 4],
              "sort_order": 0,
              "archived_at": null,
              "created_at": "2026-07-07T14:42:17.79+00:00"
            }
            """.data(using: .utf8)!
        let habit = try PostgrestJSON.decoder.decode(Habit.self, from: habitJSON)
        #expect(habit.weekdays == [0, 2, 4])

        let logJSON = """
            {"habit_id": "6f1b2a34-0000-4000-8000-000000000010",
             "user_id": "6f1b2a34-0000-4000-8000-000000000003",
             "log_date": "2026-07-07",
             "created_at": "2026-07-07T14:42:17+00:00"}
            """.data(using: .utf8)!
        let log = try PostgrestJSON.decoder.decode(HabitLog.self, from: logJSON)
        #expect(log.logDate == "2026-07-07")
    }

    @Test func habitDueOnWeekday() {
        var habit = Habit(
            id: UUID(), spaceId: UUID(), createdBy: UUID(), name: "Stretch",
            weekdays: [0, 2, 4], sortOrder: 0, archivedAt: nil, createdAt: Date())
        // 2026-07-07 is a Tuesday (isoWeekday 1); 2026-07-08 a Wednesday (2).
        #expect(!habit.isDue(on: date("2026-07-07T10:00:00")))
        #expect(habit.isDue(on: date("2026-07-08T10:00:00")))
        habit.weekdays = []
        #expect(habit.isDue(on: date("2026-07-07T10:00:00")))
    }

    @Test func encoderEmitsSnakeCaseAndOmitsNils() throws {
        let payload = NewTaskPayload(
            spaceId: UUID(), createdBy: UUID(), title: "Test",
            dueAt: date("2026-07-08T15:00:00"))
        let data = try PostgrestJSON.encoder.encode(payload)
        let object = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["space_id"] != nil)
        #expect(object["created_by"] != nil)
        #expect(object["due_at"] is String)
        #expect(object["context_tags"] is [Any])
        #expect(object.keys.contains("notes") == false)
        #expect(object.keys.contains("recurrence_rule") == false)
    }

    @Test func patchWritesExplicitNullsOnlyWhenClearing() throws {
        var patch = TaskPatch()
        patch.title = "Renamed"
        patch.clearDueAt = true
        let data = try PostgrestJSON.encoder.encode(patch)
        let object = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["title"] as? String == "Renamed")
        #expect(object.keys.contains("due_at"))
        #expect(object["due_at"] is NSNull)
        #expect(object.keys.contains("defer_until") == false)
        #expect(object.keys.contains("status") == false)
    }
}

func date(_ iso: String) -> Date {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    formatter.timeZone = .current
    return formatter.date(from: iso)!
}
