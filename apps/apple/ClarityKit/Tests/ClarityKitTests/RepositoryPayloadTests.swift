import ClarityCore
import Foundation
import Testing
@testable import ClarityKit

@Suite struct PayloadAdditionTests {
    @Test func newTaskPayloadCarriesParent() throws {
        let parent = UUID()
        let payload = NewTaskPayload(
            spaceId: UUID(), createdBy: UUID(), title: "Sub", parentTaskId: parent)
        let data = try PostgrestJSON.encoder.encode(payload)
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["parent_task_id"] as? String == parent.uuidString.lowercased()
            || object["parent_task_id"] as? String == parent.uuidString)
    }

    @Test func taskPatchAssignsAndClearsAssignee() throws {
        var patch = TaskPatch()
        patch.assignedTo = UUID()
        var data = try PostgrestJSON.encoder.encode(patch)
        var object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["assigned_to"] is String)

        var clearing = TaskPatch()
        clearing.clearAssignedTo = true
        data = try PostgrestJSON.encoder.encode(clearing)
        object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["assigned_to"] is NSNull)

        let untouched = TaskPatch()
        data = try PostgrestJSON.encoder.encode(untouched)
        object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object.keys.contains("assigned_to") == false)
    }

    @Test func projectPatchWritesNullsOnlyWhenClearing() throws {
        var patch = ProjectPatch()
        patch.status = .completed
        patch.completedAt = date("2026-07-07T10:00:00")
        var data = try PostgrestJSON.encoder.encode(patch)
        var object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["status"] as? String == "completed")
        #expect(object["completed_at"] is String)
        #expect(object.keys.contains("area_id") == false)
        #expect(object.keys.contains("name") == false)

        var reopen = ProjectPatch()
        reopen.status = .active
        reopen.clearCompletedAt = true
        reopen.clearAreaId = true
        data = try PostgrestJSON.encoder.encode(reopen)
        object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["status"] as? String == "active")
        #expect(object["completed_at"] is NSNull)
        #expect(object["area_id"] is NSNull)
    }

    @Test func reviewPatchEncodesChecklistAndCompletion() throws {
        var patch = ReviewPatch()
        patch.checklist = ["inbox": true]
        patch.completedAt = date("2026-07-07T10:00:00")
        patch.notes = "Good week"
        let data = try PostgrestJSON.encoder.encode(patch)
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let checklist = try #require(object["checklist"] as? [String: Any])
        #expect(checklist["inbox"] as? Bool == true)
        #expect(object["completed_at"] is String)
        #expect(object["notes"] as? String == "Good week")

        let empty = ReviewPatch()
        let emptyData = try PostgrestJSON.encoder.encode(empty)
        let emptyObject = try #require(
            JSONSerialization.jsonObject(with: emptyData) as? [String: Any])
        #expect(emptyObject.isEmpty)
    }
}

@Suite struct SubtaskCountTests {
    @Test func aggregatesDoneAndTotalPerParent() {
        let a = UUID()
        let b = UUID()
        let counts = TaskRepository.aggregateSubtaskCounts([
            (a, .done), (a, .next), (a, .done),
            (b, .inbox),
            (nil, .done),
        ])
        #expect(counts[a]?.done == 2)
        #expect(counts[a]?.total == 3)
        #expect(counts[b]?.done == 0)
        #expect(counts[b]?.total == 1)
        #expect(counts.count == 2)
    }
}

@Suite struct JoinDecodingTests {
    @Test func decodesMemberWithProfile() throws {
        let json = """
            [{"user_id": "6f1b2a34-0000-4000-8000-000000000003",
              "role": "owner",
              "profile": {"display_name": "Me", "email": "me@example.com"}}]
            """.data(using: .utf8)!
        let members = try PostgrestJSON.decoder.decode([SpaceMemberInfo].self, from: json)
        #expect(members.first?.role == .owner)
        #expect(members.first?.profile.displayName == "Me")
    }

    @Test func decodesCommentWithAuthor() throws {
        let json = """
            {"id": "6f1b2a34-0000-4000-8000-000000000070",
             "task_id": "6f1b2a34-0000-4000-8000-000000000001",
             "user_id": "6f1b2a34-0000-4000-8000-000000000003",
             "body": "Done!",
             "created_at": "2026-07-07T14:42:17.793486+00:00",
             "profile": {"display_name": "Me"}}
            """.data(using: .utf8)!
        let comment = try PostgrestJSON.decoder.decode(TaskCommentInfo.self, from: json)
        #expect(comment.profile.displayName == "Me")
    }

    @Test func decodesCalendarAccountWithPartialSettings() throws {
        let json = """
            {"id": "6f1b2a34-0000-4000-8000-000000000090",
             "provider": "google",
             "email": "me@example.com",
             "calendar_id": "primary",
             "settings": {"workStart": "10:00"}}
            """.data(using: .utf8)!
        let account = try PostgrestJSON.decoder.decode(CalendarAccountInfo.self, from: json)
        #expect(account.settings.workStart == "10:00")
        #expect(account.settings.maxBlocks == 6)
    }
}
