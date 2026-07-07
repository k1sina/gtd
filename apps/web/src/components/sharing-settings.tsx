"use client";

import { Check, Copy, Link2, Trash2, Users } from "lucide-react";
import { useState } from "react";
import {
  useCreateInvite,
  useRevokeInvite,
  useSpaceInvites,
  useSpaceMembers,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { Badge, Button, Input } from "./ui";

/** Members + invite management for the current (non-personal) space. */
export function SharingSettings() {
  const { currentSpace } = useSpace();
  const { data: members = [] } = useSpaceMembers(currentSpace?.id);
  const { data: invites = [] } = useSpaceInvites(currentSpace?.id);
  const createInvite = useCreateInvite();
  const revokeInvite = useRevokeInvite();

  const [email, setEmail] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (!currentSpace) return null;

  if (currentSpace.is_personal) {
    return (
      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Users size={15} className="text-accent" /> Sharing
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          Your personal space is private. To collaborate — say, with your
          partner — create a shared space from the space switcher (top-left)
          and invite them there.
        </p>
      </section>
    );
  }

  async function invite() {
    if (!email.trim() || !currentSpace) return;
    await createInvite.mutateAsync({
      spaceId: currentSpace.id,
      email: email.trim().toLowerCase(),
    });
    setEmail("");
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  }

  const pending = invites.filter((i) => !i.accepted_at);

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Users size={15} className="text-accent" /> Sharing —{" "}
        {currentSpace.name}
      </h2>

      <div className="mt-3 flex flex-col gap-1.5">
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2.5 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-canvas text-[11px] font-semibold uppercase text-ink-soft">
              {(m.profile?.display_name || m.profile?.email || "?").slice(0, 1)}
            </span>
            <span className="font-medium">
              {m.profile?.display_name || m.profile?.email}
            </span>
            <span className="text-xs text-ink-faint">{m.profile?.email}</span>
            <Badge tone={m.role === "owner" ? "accent" : "neutral"}>
              {m.role}
            </Badge>
          </div>
        ))}
      </div>

      <div className="mt-4 flex max-w-md items-center gap-2">
        <Input
          type="email"
          placeholder="Invite by email…"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
        />
        <Button
          variant="primary"
          disabled={!email.includes("@") || createInvite.isPending}
          onClick={invite}
        >
          Invite
        </Button>
      </div>

      {pending.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Pending invites
          </h3>
          <div className="flex flex-col gap-1">
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-1.5 text-sm"
              >
                <Link2 size={13} className="text-ink-faint" />
                <span className="flex-1">{inv.email}</span>
                <Button size="sm" variant="ghost" onClick={() => copyLink(inv.token)}>
                  {copiedToken === inv.token ? (
                    <>
                      <Check size={12} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Copy link
                    </>
                  )}
                </Button>
                <button
                  onClick={() => revokeInvite.mutate(inv.id)}
                  className="rounded p-1 text-ink-faint hover:text-red-600 cursor-pointer"
                  title="Revoke invite"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Send the link to the person you invited — they join after signing
            in with any account.
          </p>
        </div>
      )}
    </section>
  );
}
