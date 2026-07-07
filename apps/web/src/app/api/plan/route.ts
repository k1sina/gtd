import { NextResponse, type NextRequest } from "next/server";
import {
  isDeferred,
  planDay,
  type Interval,
  type PlannableTask,
} from "@gtd/shared";
import {
  getCalendarAccount,
  getValidAccessToken,
  plannerConfig,
} from "@/lib/calendar-account";
import { listEvents } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/plan { date?: "YYYY-MM-DD", spaceId: string }
 * Proposes time blocks for the day from top-priority open tasks and the
 * user's calendar, replacing any previous suggestions for that day.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const spaceId: string | undefined = body.spaceId;
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId required" }, { status: 400 });
  }
  const day = body.date ? new Date(`${body.date}T00:00:00`) : new Date();
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const now = new Date();

  const account = await getCalendarAccount(supabase);
  const config = plannerConfig(account);

  // Busy intervals: calendar events (when connected) + already-confirmed blocks.
  const busy: Interval[] = [];
  if (account) {
    try {
      const token = await getValidAccessToken(supabase, account);
      const events = await listEvents(token, account.calendar_id, dayStart, dayEnd);
      for (const e of events) {
        if (e.transparency === "transparent") continue;
        if (e.start?.dateTime && e.end?.dateTime) {
          busy.push({ start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) });
        }
      }
    } catch (err) {
      console.error("Plan: calendar fetch failed, planning without events:", err);
    }
  }

  const { data: confirmed } = await supabase
    .from("time_blocks")
    .select("starts_at, ends_at")
    .in("status", ["confirmed", "synced"])
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString());
  for (const b of confirmed ?? []) {
    busy.push({ start: new Date(b.starts_at), end: new Date(b.ends_at) });
  }

  // Candidate tasks: open next/scheduled tasks in the space, not deferred,
  // not due later than… any due date is fine — priority already weighs it.
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, urgency, importance, due_at, defer_until, estimated_minutes, status, parent_task_id")
    .eq("space_id", spaceId)
    .in("status", ["next", "scheduled"]);
  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  const candidates: PlannableTask[] = (tasks ?? [])
    .filter((t) => !t.parent_task_id && !isDeferred(t, now))
    .map((t) => ({
      id: t.id,
      title: t.title,
      urgency: t.urgency,
      importance: t.importance,
      due_at: t.due_at,
      estimated_minutes: t.estimated_minutes,
    }));

  const blocks = planDay(candidates, busy, dayStart, config, now);

  // Replace previous suggestions for this day.
  await supabase
    .from("time_blocks")
    .delete()
    .eq("status", "suggested")
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString());

  if (blocks.length === 0) {
    return NextResponse.json({ blocks: [], calendarConnected: !!account });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("time_blocks")
    .insert(
      blocks.map((b) => ({
        user_id: user.id,
        task_id: b.taskId,
        starts_at: b.start.toISOString(),
        ends_at: b.end.toISOString(),
        status: "suggested",
      }))
    )
    .select();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    blocks: inserted.map((b, i) => ({ ...b, title: blocks[i]!.title })),
    calendarConnected: !!account,
  });
}
