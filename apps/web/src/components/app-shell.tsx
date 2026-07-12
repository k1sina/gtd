"use client";

import clsx from "clsx";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Compass,
  Heart,
  Hourglass,
  Inbox,
  LayoutList,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCreateSpace, useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { createClient } from "@/lib/supabase/client";
import { QuickAdd } from "./quick-add";
import { Button, Dialog, Input } from "./ui";

// Sidebar groups follow the GTD loop: engage first (you live in Today/Next),
// then capture, then the parked/upcoming lists, then reflection. Search and
// Settings live outside the nav (top action / footer). Assistant is hidden
// for now — the user drives Clarity through Claude via MCP instead; the
// /assistant route still works, re-add an entry to restore it. Mirrored in
// apps/apple MainView.swift AppSection.groups.
const NAV_GROUPS: {
  label?: string;
  items: {
    href: string;
    label: string;
    icon: typeof Sun;
    badge?: "inbox";
  }[];
}[] = [
  {
    items: [
      { href: "/today", label: "Today", icon: Sun },
      { href: "/next", label: "Next actions", icon: LayoutList },
    ],
  },
  {
    label: "Capture",
    items: [{ href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" }],
  },
  {
    label: "Upcoming & parked",
    items: [
      { href: "/scheduled", label: "Scheduled", icon: CalendarClock },
      { href: "/waiting", label: "Waiting for", icon: Hourglass },
      { href: "/someday", label: "Someday / maybe", icon: Moon },
      { href: "/habits", label: "Habits", icon: RefreshCcw },
    ],
  },
  {
    label: "Reflect",
    items: [
      { href: "/review", label: "Reviews", icon: Compass },
      { href: "/goals", label: "Goals & values", icon: Heart },
    ],
  },
];

export function AppShell({
  children,
  userEmail,
  displayName,
}: {
  children: React.ReactNode;
  userEmail: string;
  displayName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { spaces, currentSpace, setCurrentSpaceId } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navigating (mobile) closes the drawer.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const inboxCount = useMemo(
    () => tasks.filter((t) => t.status === "inbox" && !t.parent_task_id).length,
    [tasks]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (!typing && e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (!typing && e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        router.push("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-surface px-3 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="rounded p-1.5 text-ink-soft hover:bg-canvas cursor-pointer"
        >
          <Menu size={18} />
        </button>
        <span className="flex-1 truncate text-sm font-semibold">
          {currentSpace?.name ?? "Clarity"}
        </span>
        <button
          onClick={() => setQuickAddOpen(true)}
          aria-label="Add to inbox"
          className="rounded p-1.5 text-accent hover:bg-accent-soft cursor-pointer"
        >
          <Plus size={18} />
        </button>
      </header>

      {/* Backdrop for the mobile drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface transition-transform md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Space switcher */}
        <div className="relative border-b border-line p-3">
          <button
            onClick={() => setSpaceMenuOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-canvas cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
              <CheckCircle2 size={16} />
            </span>
            <span className="flex-1 truncate">
              <span className="block text-sm font-semibold leading-4">
                {currentSpace?.name ?? "…"}
              </span>
              <span className="block text-[11px] text-ink-faint">Clarity</span>
            </span>
            <ChevronDown size={14} className="text-ink-faint" />
          </button>
          {spaceMenuOpen && (
            <div
              className="fixed inset-0 z-10"
              onClick={() => setSpaceMenuOpen(false)}
            />
          )}
          {spaceMenuOpen && (
            <div className="absolute left-3 right-3 top-full z-20 mt-1 rounded-lg border border-line bg-surface p-1 shadow-lg">
              {spaces.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setCurrentSpaceId(s.id);
                    setSpaceMenuOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-canvas cursor-pointer",
                    s.id === currentSpace?.id && "font-semibold"
                  )}
                >
                  {s.name}
                  {s.is_personal && (
                    <span className="text-[10px] text-ink-faint">personal</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setSpaceMenuOpen(false);
                  setNewSpaceOpen(true);
                }}
                className="flex w-full items-center gap-1.5 rounded-md border-t border-line px-2 py-1.5 text-sm text-accent hover:bg-canvas cursor-pointer"
              >
                <Plus size={13} /> New shared space
              </button>
            </div>
          )}
        </div>

        {/* Quick actions: capture + search, always within reach */}
        <div className="flex flex-col gap-2 p-3">
          <button
            onClick={() => setQuickAddOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-line px-3 py-2 text-sm text-ink-soft hover:border-accent hover:text-accent cursor-pointer"
          >
            <Plus size={15} />
            Add to inbox
            <kbd className="ml-auto rounded border border-line bg-canvas px-1.5 text-[10px] text-ink-faint">
              N
            </kbd>
          </button>
          <Link
            href="/search"
            className={clsx(
              "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm",
              pathname.startsWith("/search")
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-ink-soft hover:border-accent hover:text-accent"
            )}
          >
            <Search size={15} />
            Search
            <kbd className="ml-auto rounded border border-line bg-canvas px-1.5 text-[10px] text-ink-faint">
              /
            </kbd>
          </Link>
        </div>

        {/* Nav */}
        <nav className="thin-scroll flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.label ?? i} className={clsx(i > 0 && "mt-4")}>
              {group.label && (
                <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                    pathname === item.href ||
                      (item.href !== "/today" && pathname.startsWith(item.href))
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink-soft hover:bg-canvas hover:text-ink"
                  )}
                >
                  <item.icon size={16} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge === "inbox" && inboxCount > 0 && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {inboxCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer: settings + user */}
        <div className="border-t border-line p-3">
          <Link
            href="/settings"
            className={clsx(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
              pathname.startsWith("/settings")
                ? "bg-accent-soft font-medium text-accent"
                : "text-ink-soft hover:bg-canvas hover:text-ink"
            )}
          >
            <Settings size={16} />
            Settings
          </Link>
          <div className="mt-2 flex items-center gap-2 px-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-semibold text-ink-soft uppercase">
              {(displayName || userEmail).slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{displayName || "You"}</p>
              <p className="truncate text-[11px] text-ink-faint">{userEmail}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="rounded p-1.5 text-ink-faint hover:bg-canvas hover:text-ink cursor-pointer"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 pt-12 md:ml-60 md:pt-0">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>

      {quickAddOpen && <QuickAdd onClose={() => setQuickAddOpen(false)} />}
      {newSpaceOpen && (
        <NewSpaceDialog
          onClose={() => setNewSpaceOpen(false)}
          onCreated={(id) => {
            setCurrentSpaceId(id);
            setNewSpaceOpen(false);
            router.push("/settings");
          }}
        />
      )}
    </div>
  );
}

function NewSpaceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (spaceId: string) => void;
}) {
  const createSpace = useCreateSpace();
  const [name, setName] = useState("");

  async function submit() {
    if (!name.trim()) return;
    const space = await createSpace.mutateAsync(name.trim());
    onCreated(space.id);
  }

  return (
    <Dialog open onClose={onClose} title="New shared space">
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-ink-soft">
          A shared space is a separate world of tasks you can
          invite others into — e.g. “Family” for planning with your partner.
          Your personal space stays private.
        </p>
        <Input
          autoFocus
          placeholder="Space name (e.g. Family)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={submit}>
          Create space
        </Button>
      </div>
    </Dialog>
  );
}
