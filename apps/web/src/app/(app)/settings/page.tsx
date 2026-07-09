"use client";

import { DEFAULT_PLANNER_CONFIG } from "@gtd/shared";
import { CalendarDays, Check, Sparkles, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SharingSettings } from "@/components/sharing-settings";
import { PageHeader } from "@/components/task-list";
import { Button, Input, Select } from "@/components/ui";
import {
  useCalendarAccount,
  useDisconnectCalendar,
  useIntegrationStatus,
  useSaveUserSettings,
  useUpdateCalendarAccount,
} from "@/lib/data";
import { useQuery } from "@tanstack/react-query";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google OAuth isn't set up yet — add your Google client ID and secret below.",
  google_denied: "Google sign-in was cancelled or the state check failed.",
  google_no_refresh_token:
    "Google didn't return a refresh token. Remove Clarity's access at myaccount.google.com/permissions, then connect again.",
  google_exchange_failed:
    "Connecting to Google failed — double-check the client ID and secret below.",
  google_reauth_required:
    "Google connection expired — reconnect below. Tip: publish your Google OAuth app to Production (no verification needed) so this stops happening.",
};

function SavedNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
      <Check size={12} /> Saved
    </p>
  );
}

function AssistantSettings() {
  const { data: status } = useIntegrationStatus();
  const save = useSaveUserSettings();
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  const configured = status?.anthropic.configured;

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles size={15} className="text-accent" /> AI assistant
      </h2>
      <p className="mt-1 text-xs text-ink-faint">
        {configured
          ? status?.anthropic.source === "settings"
            ? "Using your API key."
            : "Using the server's API key. Add your own to override it."
          : "Paste an Anthropic API key to enable the assistant. Create one at console.anthropic.com → API keys."}
      </p>
      <form
        className="mt-3 flex max-w-lg items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = key.trim();
          save.mutate(
            { anthropic_api_key: trimmed === "" ? null : trimmed },
            {
              onSuccess: () => {
                setSaved(true);
                setKey("");
              },
            }
          );
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-xs text-ink-soft">
          Anthropic API key
          <Input
            type="password"
            placeholder={
              status?.anthropic.source === "settings"
                ? "••••••••••••  (key saved — paste a new one to replace it)"
                : "sk-ant-…"
            }
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={
            save.isPending ||
            (key.trim() === "" && status?.anthropic.source !== "settings")
          }
        >
          {key.trim() === "" && status?.anthropic.source === "settings"
            ? "Remove key"
            : "Save"}
        </Button>
      </form>
      {save.isError && (
        <p className="mt-2 text-xs text-red-600">{save.error.message}</p>
      )}
      <SavedNote show={saved && !save.isPending} />
    </section>
  );
}

function GoogleSetupCard() {
  const { data: status } = useIntegrationStatus();
  const save = useSaveUserSettings();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saved, setSaved] = useState(false);

  const redirectUri =
    status?.google.redirect_uri ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/google/callback`
      : "");

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Connect your calendar to see events on the Today view and let Clarity
        block focus time for your top priorities. One-time setup with your own
        (free) Google app:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-soft">
        <li>
          Open{" "}
          <a
            className="text-accent underline"
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
          >
            console.cloud.google.com/apis/credentials
          </a>{" "}
          and create an <b>OAuth client ID</b> (type: Web application). If
          asked, configure the consent screen first (audience: External) and
          enable the <b>Google Calendar API</b>.
        </li>
        <li>
          Under <b>Audience</b> (the consent screen page), click{" "}
          <b>Publish app</b> to move it to Production. <b>Skip verification</b>{" "}
          — you don&apos;t need it for your own app. (If left in Testing mode,
          Google disconnects the calendar every 7 days.)
        </li>
        <li>
          Add this <b>authorized redirect URI</b>:{" "}
          <code className="select-all rounded bg-canvas px-1 py-0.5 font-mono text-[11px]">
            {redirectUri}
          </code>
        </li>
        <li>
          Paste the client ID and secret here and hit Save, then Connect. When
          Google warns that it &ldquo;hasn&rsquo;t verified this app&rdquo;,
          click <b>Advanced → Go to Clarity</b> — it&apos;s your own app, so
          this one-time warning is expected and safe.
        </li>
      </ol>
      <form
        className="grid max-w-lg gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              google_client_id: clientId.trim() || null,
              google_client_secret: clientSecret.trim() || null,
            },
            { onSuccess: () => setSaved(true) }
          );
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Client ID
          <Input
            placeholder="…apps.googleusercontent.com"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Client secret
          <Input
            type="password"
            placeholder="GOCSPX-…"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button
            type="submit"
            variant="primary"
            disabled={save.isPending || !clientId.trim() || !clientSecret.trim()}
          >
            Save
          </Button>
          {status?.google.configured && (
            <a href="/api/google/connect">
              <Button type="button">Connect Google Calendar</Button>
            </a>
          )}
        </div>
      </form>
      {save.isError && (
        <p className="text-xs text-red-600">{save.error.message}</p>
      )}
      <SavedNote show={saved && !save.isPending} />
    </div>
  );
}

function GoogleConnectReady() {
  const { data: status } = useIntegrationStatus();
  return (
    <div className="mt-3">
      <p className="mb-3 text-sm text-ink-soft">
        Connect your calendar to see events on the Today view and let Clarity
        block focus time for your top priorities.
        {status?.google.source === "settings" && (
          <span className="text-ink-faint"> Using your saved Google app.</span>
        )}
      </p>
      <a href="/api/google/connect">
        <Button variant="primary">Connect Google Calendar</Button>
      </a>
    </div>
  );
}

function SettingsContent() {
  const params = useSearchParams();
  const { data: account, isLoading } = useCalendarAccount();
  const { data: status } = useIntegrationStatus();
  const updateAccount = useUpdateCalendarAccount();
  const disconnect = useDisconnectCalendar();
  const [saved, setSaved] = useState(false);
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);

  const { data: calendarList } = useQuery({
    queryKey: ["google_calendars"],
    enabled: !!account,
    queryFn: async () => {
      const res = await fetch("/api/google/calendars");
      return res.json();
    },
  });

  const settings = {
    ...DEFAULT_PLANNER_CONFIG,
    ...((account?.settings as object) ?? {}),
  };

  const error = params.get("error");
  const justConnected = params.get("connected") === "1";

  function saveSettings(patch: Record<string, unknown>) {
    if (!account) return;
    updateAccount.mutate(
      { id: account.id, settings: { ...settings, ...patch } },
      { onSuccess: () => setSaved(true) }
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Sharing, integrations, and planning preferences"
      />

      <SharingSettings />

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {ERROR_MESSAGES[error] ?? error}
        </p>
      )}
      {justConnected && (
        <p className="mb-4 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <Check size={13} /> Google Calendar connected.
        </p>
      )}

      <AssistantSettings />

      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays size={15} className="text-accent" /> Google Calendar
        </h2>
        {isLoading ? (
          <p className="mt-3 text-sm text-ink-faint">Loading…</p>
        ) : account ? (
          <div className="mt-3 flex flex-col gap-4">
            {calendarList?.error === "google_reauth_required" && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span>
                  Google connection expired — reconnect to keep reading events
                  and syncing blocks. To stop this from recurring, publish your
                  Google OAuth app to Production (no verification needed).
                </span>
                <a href="/api/google/connect" className="shrink-0">
                  <Button size="sm" variant="primary">
                    Reconnect
                  </Button>
                </a>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm">
                Connected as <span className="font-medium">{account.email}</span>
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => disconnect.mutate(account.id)}
              >
                <Unplug size={13} /> Disconnect
              </Button>
            </div>
            {calendarList?.calendars?.length > 0 && (
              <label className="flex max-w-sm flex-col gap-1 text-xs text-ink-soft">
                Calendar for time blocks
                <Select
                  value={account.calendar_id}
                  onChange={(e) =>
                    updateAccount.mutate({
                      id: account.id,
                      calendar_id: e.target.value,
                    })
                  }
                >
                  {calendarList.calendars.map(
                    (c: { id: string; summary: string; primary: boolean }) => (
                      <option key={c.id} value={c.primary ? "primary" : c.id}>
                        {c.summary}
                        {c.primary ? " (primary)" : ""}
                      </option>
                    )
                  )}
                </Select>
              </label>
            )}
          </div>
        ) : status && !status.google.configured ? (
          <GoogleSetupCard />
        ) : showGoogleSetup ? (
          <GoogleSetupCard />
        ) : (
          <>
            <GoogleConnectReady />
            <button
              className="mt-2 text-xs text-ink-faint underline"
              onClick={() => setShowGoogleSetup(true)}
            >
              Change Google app credentials
            </button>
          </>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Daily planning</h2>
        {!account && (
          <p className="mt-1 text-xs text-ink-faint">
            Preferences apply once a calendar is connected; planning without a
            calendar uses your working hours only.
          </p>
        )}
        <div className="mt-3 grid max-w-lg grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Workday starts
            <Input
              type="time"
              defaultValue={settings.workStart}
              disabled={!account}
              onBlur={(e) => saveSettings({ workStart: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Workday ends
            <Input
              type="time"
              defaultValue={settings.workEnd}
              disabled={!account}
              onBlur={(e) => saveSettings({ workEnd: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Default focus block (minutes)
            <Input
              type="number"
              min={15}
              step={5}
              defaultValue={settings.defaultBlockMinutes}
              disabled={!account}
              onBlur={(e) =>
                saveSettings({ defaultBlockMinutes: parseInt(e.target.value, 10) || 45 })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Max blocks per day
            <Input
              type="number"
              min={1}
              max={12}
              defaultValue={settings.maxBlocks}
              disabled={!account}
              onBlur={(e) =>
                saveSettings({ maxBlocks: parseInt(e.target.value, 10) || 6 })
              }
            />
          </label>
        </div>
        <SavedNote show={saved} />
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
