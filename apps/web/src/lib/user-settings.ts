// Per-user integration settings (Settings page), with server env vars as the
// fallback for self-hosters who prefer configuration by environment.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserSettings {
  anthropic_api_key: string | null;
  google_client_id: string | null;
  google_client_secret: string | null;
}

export async function getUserSettings(
  supabase: SupabaseClient
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("anthropic_api_key, google_client_id, google_client_secret")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  source: "settings" | "env";
}

export async function getGoogleCredentials(
  supabase: SupabaseClient
): Promise<GoogleCredentials | null> {
  const settings = await getUserSettings(supabase).catch(() => null);
  if (settings?.google_client_id && settings.google_client_secret) {
    return {
      clientId: settings.google_client_id,
      clientSecret: settings.google_client_secret,
      source: "settings",
    };
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      source: "env",
    };
  }
  return null;
}

export async function getAnthropicApiKey(
  supabase: SupabaseClient
): Promise<string | null> {
  const settings = await getUserSettings(supabase).catch(() => null);
  return settings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || null;
}
