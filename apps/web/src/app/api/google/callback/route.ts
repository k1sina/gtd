import { NextResponse, type NextRequest } from "next/server";
import { emailFromIdToken, exchangeCode } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || state !== user.id) {
    return NextResponse.redirect(
      new URL("/settings?error=google_denied", request.url)
    );
  }

  try {
    const redirectUri = new URL("/api/google/callback", request.url).toString();
    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.refresh_token) {
      // Without a refresh token the connection dies within an hour.
      return NextResponse.redirect(
        new URL("/settings?error=google_no_refresh_token", request.url)
      );
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

    return NextResponse.redirect(new URL("/settings?connected=1", request.url));
  } catch (err) {
    console.error("Google callback failed:", err);
    return NextResponse.redirect(
      new URL("/settings?error=google_exchange_failed", request.url)
    );
  }
}
