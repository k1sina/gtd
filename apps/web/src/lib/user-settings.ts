// Per-user integration settings (Settings page), with server env vars as the
// fallback for self-hosters who prefer configuration by environment.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserSettings {
  anthropic_api_key: string | null;
}

export async function getUserSettings(
  supabase: SupabaseClient
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("anthropic_api_key")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAnthropicApiKey(
  supabase: SupabaseClient
): Promise<string | null> {
  const settings = await getUserSettings(supabase).catch(() => null);
  return settings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || null;
}
