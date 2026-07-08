import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "./server";

/**
 * Auth context for API routes. The web app authenticates with the session
 * cookie; the native apps (iOS/macOS) send the Supabase access token as
 * `Authorization: Bearer <jwt>`. Either way the returned client runs as the
 * signed-in user (RLS applies) and `user` is validated server-side.
 */
export async function createApiContext(
  request: Request
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];

  if (!token) {
    const supabase = await createCookieClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { supabase, user };
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  // getUser(token) verifies the JWT against Supabase Auth rather than
  // trusting the header.
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  return { supabase, user: user ?? null };
}
