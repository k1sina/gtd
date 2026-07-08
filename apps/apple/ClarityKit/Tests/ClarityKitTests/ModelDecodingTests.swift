import ClarityCore
import Foundation
import Testing
@testable import ClarityKit

// Decoding fixtures for the rows added for web feature parity; column names
// come straight from supabase/migrations/20260707000000_init.sql.

@Suite struct ModelDecodingTests {
    @Test func decodesProjectWithHorizonColumns() throws {
        let json = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000020",
              "space_id": "6f1b2a34-0000-4000-8000-000000000002",
              "area_id": "6f1b2a34-0000-4000-8000-000000000021",
              "goal_id": null,
              "name": "Garden overhaul",
              "outcome": "A usable garden",
              "status": "on_hold",
              "sort_order": 2,
              "reviewed_at": null,
              "created_at": "2026-07-07T14:42:17.793486+00:00",
              "completed_at": null
            }
            """.data(using: .utf8)!
        let project = try PostgrestJSON.decoder.decode(Project.self, from: json)
        #expect(project.status == .onHold)
        #expect(project.areaId != nil)
        #expect(project.goalId == nil)
        #expect(project.completedAt == nil)
    }

    @Test func decodesSpaceRow() throws {
        let json = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000002",
              "name": "Personal",
              "is_personal": true,
              "created_by": "6f1b2a34-0000-4000-8000-000000000003",
              "created_at": "2026-07-07T14:42:17+00:00"
            }
            """.data(using: .utf8)!
        let space = try PostgrestJSON.decoder.decode(Space.self, from: json)
        #expect(space.isPersonal)
        #expect(space.name == "Personal")
    }

    @Test func decodesAreaGoalAndValue() throws {
        let areaJSON = """
            {"id": "6f1b2a34-0000-4000-8000-000000000021",
             "space_id": "6f1b2a34-0000-4000-8000-000000000002",
             "name": "Home", "color": null, "sort_order": 0,
             "created_at": "2026-07-07T14:42:17+00:00"}
            """.data(using: .utf8)!
        let area = try PostgrestJSON.decoder.decode(Area.self, from: areaJSON)
        #expect(area.name == "Home")

        let goalJSON = """
            {"id": "6f1b2a34-0000-4000-8000-000000000030",
             "user_id": "6f1b2a34-0000-4000-8000-000000000003",
             "value_id": null, "title": "Run a 10k", "description": null,
             "year": 2026, "quarter": 3, "status": "active", "score": null,
             "reflection": null, "sort_order": 0,
             "created_at": "2026-07-07T14:42:17+00:00"}
            """.data(using: .utf8)!
        let goal = try PostgrestJSON.decoder.decode(Goal.self, from: goalJSON)
        #expect(goal.status == .active)
        #expect(goal.quarter == 3)

        let valueJSON = """
            {"id": "6f1b2a34-0000-4000-8000-000000000031",
             "user_id": "6f1b2a34-0000-4000-8000-000000000003",
             "name": "Health", "description": "Body and mind", "sort_order": 0,
             "created_at": "2026-07-07T14:42:17+00:00"}
            """.data(using: .utf8)!
        let value = try PostgrestJSON.decoder.decode(LifeValue.self, from: valueJSON)
        #expect(value.description == "Body and mind")
    }

    @Test func decodesReviewWithChecklist() throws {
        let json = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000040",
              "user_id": "6f1b2a34-0000-4000-8000-000000000003",
              "type": "weekly",
              "period_start": "2026-07-06",
              "period_end": "2026-07-12",
              "checklist": {"inbox": true, "calendar": false},
              "notes": null,
              "started_at": "2026-07-07T14:42:17.793486+00:00",
              "completed_at": null
            }
            """.data(using: .utf8)!
        let review = try PostgrestJSON.decoder.decode(Review.self, from: json)
        #expect(review.type == .weekly)
        #expect(review.periodStart == "2026-07-06")
        #expect(review.checklist == ["inbox": true, "calendar": false])
        #expect(review.completedAt == nil)
    }

    @Test func decodesTimeBlock() throws {
        let json = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000050",
              "user_id": "6f1b2a34-0000-4000-8000-000000000003",
              "task_id": "6f1b2a34-0000-4000-8000-000000000001",
              "calendar_event_id": null,
              "starts_at": "2026-07-07T09:00:00+00:00",
              "ends_at": "2026-07-07T09:45:00+00:00",
              "status": "suggested",
              "created_at": "2026-07-07T08:00:00+00:00"
            }
            """.data(using: .utf8)!
        let block = try PostgrestJSON.decoder.decode(TimeBlock.self, from: json)
        #expect(block.status == .suggested)
        #expect(block.endsAt > block.startsAt)
    }

    @Test func decodesInviteProfileAndComment() throws {
        let inviteJSON = """
            {"id": "6f1b2a34-0000-4000-8000-000000000060",
             "space_id": "6f1b2a34-0000-4000-8000-000000000002",
             "email": "friend@example.com",
             "token": "6f1b2a34-0000-4000-8000-000000000061",
             "invited_by": "6f1b2a34-0000-4000-8000-000000000003",
             "created_at": "2026-07-07T14:42:17+00:00",
             "accepted_at": null}
            """.data(using: .utf8)!
        let invite = try PostgrestJSON.decoder.decode(SpaceInvite.self, from: inviteJSON)
        #expect(invite.acceptedAt == nil)
        #expect(invite.email == "friend@example.com")

        let profileJSON = """
            {"id": "6f1b2a34-0000-4000-8000-000000000003",
             "email": "me@example.com", "display_name": "Me",
             "created_at": "2026-07-07T14:42:17+00:00"}
            """.data(using: .utf8)!
        let profile = try PostgrestJSON.decoder.decode(Profile.self, from: profileJSON)
        #expect(profile.displayName == "Me")

        let commentJSON = """
            {"id": "6f1b2a34-0000-4000-8000-000000000070",
             "space_id": "6f1b2a34-0000-4000-8000-000000000002",
             "task_id": "6f1b2a34-0000-4000-8000-000000000001",
             "user_id": "6f1b2a34-0000-4000-8000-000000000003",
             "body": "On it!",
             "created_at": "2026-07-07T14:42:17.793486+00:00"}
            """.data(using: .utf8)!
        let comment = try PostgrestJSON.decoder.decode(TaskComment.self, from: commentJSON)
        #expect(comment.body == "On it!")
    }

    @Test func decodesChatMessageWithMixedBlocks() throws {
        let json = """
            {
              "id": "6f1b2a34-0000-4000-8000-000000000080",
              "session_id": "6f1b2a34-0000-4000-8000-000000000081",
              "role": "assistant",
              "content": [
                {"type": "thinking", "thinking": "…", "signature": "s"},
                {"type": "text", "text": "Created it."},
                {"type": "tool_use", "id": "t1", "name": "create_task", "input": {}}
              ],
              "created_at": "2026-07-07T14:42:17+00:00"
            }
            """.data(using: .utf8)!
        let message = try PostgrestJSON.decoder.decode(ChatMessage.self, from: json)
        #expect(message.text == "Created it.")
        #expect(message.toolNames == ["create_task"])
    }
}
