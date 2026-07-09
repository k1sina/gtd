import { NextResponse, type NextRequest } from "next/server";
import { authUrl } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";
import { getGoogleCredentials } from "@/lib/user-settings";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const creds = await getGoogleCredentials(supabase);
  if (!creds) {
    return NextResponse.redirect(
      new URL("/settings?error=google_not_configured", request.url)
    );
  }
  const redirectUri = new URL("/api/google/callback", request.url).toString();
  // Unguessable per-request CSRF state, echoed back by Google and compared
  // against this cookie in the callback. sameSite=lax still sends it on the
  // top-level redirect back from accounts.google.com.
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(authUrl(redirectUri, state, creds));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
