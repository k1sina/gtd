"use client";

import { Check, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";
import { SharingSettings } from "@/components/sharing-settings";
import { PageHeader } from "@/components/task-list";
import { Button, Input } from "@/components/ui";
import { useIntegrationStatus, useSaveUserSettings } from "@/lib/data";

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

function SettingsContent() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Sharing and integrations" />
      <SharingSettings />
      <AssistantSettings />
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
