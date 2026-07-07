// Server-only Google OAuth + Calendar API client (plain fetch, no SDK).

import "server-only";

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export interface GoogleClientCredentials {
  clientId: string;
  clientSecret: string;
}

export function authUrl(
  redirectUri: string,
  state: string,
  creds: GoogleClientCredentials
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_BASE}?${params}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export function exchangeCode(
  code: string,
  redirectUri: string,
  creds: GoogleClientCredentials
): Promise<GoogleTokens> {
  return tokenRequest(
    new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })
  );
}

export function refreshTokens(
  refreshToken: string,
  creds: GoogleClientCredentials
): Promise<GoogleTokens> {
  return tokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    })
  );
}

/** Email claim from an id_token (no verification needed — came from Google directly). */
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1]!;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return claims.email ?? null;
  } catch {
    return null;
  }
}

async function calFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Google Calendar API ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

export async function listCalendars(
  accessToken: string
): Promise<GoogleCalendarListEntry[]> {
  const data = await calFetch<{ items?: GoogleCalendarListEntry[] }>(
    accessToken,
    "/users/me/calendarList?minAccessRole=writer"
  );
  return data.items ?? [];
}

export interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  transparency?: string;
  status?: string;
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const data = await calFetch<{ items?: GoogleEvent[] }>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  );
  return (data.items ?? []).filter((e) => e.status !== "cancelled");
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
  }
): Promise<GoogleEvent> {
  return calFetch<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
      }),
    }
  );
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Failed to delete Google event (${res.status})`);
  }
}
