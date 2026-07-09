import { NextResponse } from "next/server";
import {
  getCalendarAccount,
  getValidAccessToken,
} from "@/lib/calendar-account";
import { GoogleReauthRequiredError, listCalendars } from "@/lib/google";
import { createApiContext } from "@/lib/supabase/api";

/** GET /api/google/calendars — writable calendars on the connected account. */
export async function GET(request: Request) {
  const { supabase, user } = await createApiContext(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const account = await getCalendarAccount(supabase);
  if (!account) return NextResponse.json({ connected: false, calendars: [] });

  try {
    const token = await getValidAccessToken(supabase, account);
    const calendars = await listCalendars(token);
    return NextResponse.json({
      connected: true,
      email: account.email,
      selected: account.calendar_id,
      calendars: calendars.map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: !!c.primary,
      })),
    });
  } catch (err) {
    if (err instanceof GoogleReauthRequiredError) {
      return NextResponse.json(
        { connected: true, email: account.email, calendars: [], error: "google_reauth_required" },
        { status: 401 }
      );
    }
    console.error("Calendar list failed:", err);
    return NextResponse.json(
      { connected: true, email: account.email, calendars: [], error: "calendar_list_failed" },
      { status: 502 }
    );
  }
}
