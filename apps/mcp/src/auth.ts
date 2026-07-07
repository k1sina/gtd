// Lazy Supabase sign-in: the server starts (and answers tools/list) without
// credentials; the first tool call authenticates. The client uses the anon
// key plus the user's JWT, so row-level security scopes every query.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";

// supabase-js requires a WebSocket implementation even for auth+postgrest
// use; Node 20 has none globally (Node 22+ does).
(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  spaceId: string;
}

let cached: ToolContext | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — copy apps/mcp/.env.example to apps/mcp/.env and fill it in.`
    );
  }
  return value;
}

export async function getContext(): Promise<ToolContext> {
  if (cached) return cached;

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: true } }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: requireEnv("CLARITY_EMAIL"),
    password: requireEnv("CLARITY_PASSWORD"),
  });
  if (error) throw new Error(`Supabase sign-in failed: ${error.message}`);

  let spaceId = process.env.CLARITY_SPACE_ID;
  if (!spaceId) {
    const { data: spaces, error: spaceError } = await supabase
      .from("spaces")
      .select("id")
      .eq("is_personal", true)
      .limit(1);
    if (spaceError) throw new Error(`Loading personal space failed: ${spaceError.message}`);
    spaceId = spaces?.[0]?.id;
  }
  if (!spaceId) {
    throw new Error("No personal space found — sign in to the web app once, or set CLARITY_SPACE_ID.");
  }

  cached = { supabase, userId: data.user.id, spaceId };
  return cached;
}
