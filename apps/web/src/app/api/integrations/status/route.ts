import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCredentials, getUserSettings } from "@/lib/user-settings";

/** What's configured (never the secrets themselves) — drives the Settings UI. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [settings, google] = await Promise.all([
    getUserSettings(supabase).catch(() => null),
    getGoogleCredentials(supabase).catch(() => null),
  ]);

  return NextResponse.json({
    anthropic: {
      configured: !!settings?.anthropic_api_key || !!process.env.ANTHROPIC_API_KEY,
      source: settings?.anthropic_api_key
        ? "settings"
        : process.env.ANTHROPIC_API_KEY
          ? "env"
          : null,
    },
    google: {
      configured: !!google,
      source: google?.source ?? null,
      client_id: settings?.google_client_id ?? null,
      redirect_uri: new URL("/api/google/callback", request.url).toString(),
    },
  });
}
