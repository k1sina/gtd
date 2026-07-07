"use client";

import { DEFAULT_PLANNER_CONFIG } from "@gtd/shared";
import { CalendarDays, Check, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { SharingSettings } from "@/components/sharing-settings";
import { PageHeader } from "@/components/task-list";
import { Button, Input, Select } from "@/components/ui";
import {
  useCalendarAccount,
  useDisconnectCalendar,
  useUpdateCalendarAccount,
} from "@/lib/data";
import { useQuery } from "@tanstack/react-query";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google OAuth isn't configured on the server — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/web/.env.local.",
  google_denied: "Google sign-in was cancelled or the state check failed.",
  google_no_refresh_token:
    "Google didn't return a refresh token. Remove Clarity's access at myaccount.google.com/permissions, then connect again.",
  google_exchange_failed: "Connecting to Google failed — check the server logs.",
};

function SettingsContent() {
  const params = useSearchParams();
  const { data: account, isLoading } = useCalendarAccount();
  const updateAccount = useUpdateCalendarAccount();
  const disconnect = useDisconnectCalendar();
  const [saved, setSaved] = useState(false);

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
        subtitle="Sharing, calendar connection, and planning preferences"
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

      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays size={15} className="text-accent" /> Google Calendar
        </h2>
        {isLoading ? (
          <p className="mt-3 text-sm text-ink-faint">Loading…</p>
        ) : account ? (
          <div className="mt-3 flex flex-col gap-4">
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
        ) : (
          <div className="mt-3">
            <p className="mb-3 text-sm text-ink-soft">
              Connect your calendar to see events on the Today view and let
              Clarity block focus time for your top priorities.
            </p>
            <a href="/api/google/connect">
              <Button variant="primary">Connect Google Calendar</Button>
            </a>
          </div>
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
        {saved && (
          <p className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
            <Check size={12} /> Saved
          </p>
        )}
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
