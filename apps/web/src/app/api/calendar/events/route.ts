import { NextResponse, type NextRequest } from "next/server";
import {
  getCalendarAccount,
  getValidAccessToken,
} from "@/lib/calendar-account";
import { GoogleReauthRequiredError, listEvents } from "@/lib/google";
import { createApiContext } from "@/lib/supabase/api";

/** GET /api/calendar/events?date=YYYY-MM-DD — that day's events (local time). */
export async function GET(request: NextRequest) {
  const { supabase, user } = await createApiContext(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const account = await getCalendarAccount(supabase);
  if (!account) return NextResponse.json({ connected: false, events: [] });

  const dateParam = request.nextUrl.searchParams.get("date");
  const day = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  try {
    const token = await getValidAccessToken(supabase, account);
    const events = await listEvents(token, account.calendar_id, start, end);
    return NextResponse.json({
      connected: true,
      events: events.map((e) => ({
        id: e.id,
        summary: e.summary ?? "(untitled)",
        start: e.start?.dateTime ?? e.start?.date ?? null,
        end: e.end?.dateTime ?? e.end?.date ?? null,
        allDay: !e.start?.dateTime,
        busy: e.transparency !== "transparent",
      })),
    });
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      return NextResponse.json(
        { connected: true, events: [], error: "google_reauth_required" },
        { status: 401 }
      );
    }
    console.error("Calendar events fetch failed:", err);
    return NextResponse.json(
      { connected: true, events: [], error: "calendar_fetch_failed" },
      { status: 502 }
    );
  }
}
