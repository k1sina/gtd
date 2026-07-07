// Server-side helpers for the signed-in user's Google Calendar account.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PLANNER_CONFIG, type PlannerConfig } from "@gtd/shared";
import { refreshTokens } from "./google";

export interface CalendarAccount {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  calendar_id: string;
  settings: Partial<PlannerConfig> & { [k: string]: unknown };
}

export async function getCalendarAccount(
  supabase: SupabaseClient
): Promise<CalendarAccount | null> {
  const { data, error } = await supabase
    .from("calendar_accounts")
    .select("*")
    .eq("provider", "google")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Access token for the account, refreshed (and persisted) if near expiry. */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  account: CalendarAccount
): Promise<string> {
  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : 0;
  if (expiresAt - Date.now() > 60_000) return account.access_token;

  const tokens = await refreshTokens(account.refresh_token);
  const { error } = await supabase
    .from("calendar_accounts")
    .update({
      access_token: tokens.access_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    })
    .eq("id", account.id);
  if (error) throw error;
  return tokens.access_token;
}

export function plannerConfig(account: CalendarAccount | null): PlannerConfig {
  return { ...DEFAULT_PLANNER_CONFIG, ...(account?.settings ?? {}) };
}
