import { NextResponse, type NextRequest } from "next/server";
import {
  getCalendarAccount,
  getValidAccessToken,
} from "@/lib/calendar-account";
import { insertEvent } from "@/lib/google";
import { createApiContext } from "@/lib/supabase/api";

/**
 * POST /api/plan/confirm { blockIds: string[] }
 * Confirms suggested blocks; when Google Calendar is connected, creates
 * matching events and marks the blocks as synced.
 */
export async function POST(request: NextRequest) {
  const { supabase, user } = await createApiContext(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const blockIds: string[] = Array.isArray(body.blockIds) ? body.blockIds : [];
  if (blockIds.length === 0) {
    return NextResponse.json({ error: "blockIds required" }, { status: 400 });
  }

  const { data: blocks, error } = await supabase
    .from("time_blocks")
    .select("*, tasks(title)")
    .in("id", blockIds)
    .eq("status", "suggested");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const account = await getCalendarAccount(supabase);
  const token = account ? await getValidAccessToken(supabase, account) : null;

  const results = [];
  for (const block of blocks ?? []) {
    let calendarEventId: string | null = null;
    let status = "confirmed";
    if (account && token) {
      try {
        const event = await insertEvent(token, account.calendar_id, {
          summary: `⚡ ${block.tasks?.title ?? "Focus block"}`,
          description: "Planned by Clarity",
          start: new Date(block.starts_at),
          end: new Date(block.ends_at),
        });
        calendarEventId = event.id;
        status = "synced";
      } catch (err) {
        console.error("Failed to create Google event for block:", err);
      }
    }
    const { error: updateError } = await supabase
      .from("time_blocks")
      .update({ status, calendar_event_id: calendarEventId })
      .eq("id", block.id);
    if (!updateError) results.push({ id: block.id, status });
  }

  return NextResponse.json({ confirmed: results });
}
