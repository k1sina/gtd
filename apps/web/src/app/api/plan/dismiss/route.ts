import { NextResponse, type NextRequest } from "next/server";
import { createApiContext } from "@/lib/supabase/api";

/** POST /api/plan/dismiss { date?: "YYYY-MM-DD" } — drop that day's suggestions. */
export async function POST(request: NextRequest) {
  const { supabase, user } = await createApiContext(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const day = body.date ? new Date(`${body.date}T00:00:00`) : new Date();
  day.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setDate(end.getDate() + 1);

  const { error } = await supabase
    .from("time_blocks")
    .delete()
    .eq("status", "suggested")
    .gte("starts_at", day.toISOString())
    .lt("starts_at", end.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
