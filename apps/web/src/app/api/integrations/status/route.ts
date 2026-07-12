import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/user-settings";

/** What's configured (never the secrets themselves) — drives the Settings UI. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getUserSettings(supabase).catch(() => null);

  return NextResponse.json({
    anthropic: {
      configured: !!settings?.anthropic_api_key || !!process.env.ANTHROPIC_API_KEY,
      source: settings?.anthropic_api_key
        ? "settings"
        : process.env.ANTHROPIC_API_KEY
          ? "env"
          : null,
    },
  });
}
