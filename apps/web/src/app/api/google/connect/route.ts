import { NextResponse, type NextRequest } from "next/server";
import { authUrl, googleConfigured } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?error=google_not_configured", request.url)
    );
  }
  const redirectUri = new URL("/api/google/callback", request.url).toString();
  // The user id doubles as CSRF state; the callback re-checks the session.
  return NextResponse.redirect(authUrl(redirectUri, user.id));
}
