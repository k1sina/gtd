import { NextResponse, type NextRequest } from "next/server";
import { emailFromIdToken, exchangeCode } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCredentials } from "@/lib/user-settings";

export async function GET(request: NextRequest) {
  // One-shot CSRF state: compare against the cookie set by /api/google/connect
  // and clear it on every outcome.
  const expectedState = request.cookies.get("google_oauth_state")?.value;
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.set("google_oauth_state", "", { path: "/api/google", maxAge: 0 });
    return response;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect("/login");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect("/settings?error=google_denied");
  }

  try {
    const creds = await getGoogleCredentials(supabase);
    if (!creds) {
      return redirect("/settings?error=google_not_configured");
    }
    const redirectUri = new URL("/api/google/callback", request.url).toString();
    const tokens = await exchangeCode(code, redirectUri, creds);
    if (!tokens.refresh_token) {
      // Without a refresh token the connection dies within an hour.
      return redirect("/settings?error=google_no_refresh_token");
    }
    const email = tokens.id_token ? emailFromIdToken(tokens.id_token) : null;

    const { error } = await supabase.from("calendar_accounts").upsert(
      {
        user_id: user.id,
        provider: "google",
        email: email ?? "unknown",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000
        ).toISOString(),
      },
      { onConflict: "user_id,provider,email" }
    );
    if (error) throw error;

    return redirect("/settings?connected=1");
  } catch (err) {
    console.error("Google callback failed:", err);
    return redirect("/settings?error=google_exchange_failed");
  }
}
