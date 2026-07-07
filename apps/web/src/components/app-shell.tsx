"use client";

import clsx from "clsx";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Compass,
  FolderKanban,
  Grid2x2,
  Heart,
  Hourglass,
  Inbox,
  LayoutList,
  LogOut,
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
import { useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { createClient } from "@/lib/supabase/client";
import { QuickAdd } from "./quick-add";

const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" as const },
  { href: "/next", label: "Next actions", icon: LayoutList },
  { href: "/scheduled", label: "Scheduled", icon: CalendarClock },
  { href: "/waiting", label: "Waiting for", icon: Hourglass },
  { href: "/someday", label: "Someday / maybe", icon: Moon },
  null,
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/matrix", label: "Priority matrix", icon: Grid2x2 },
  { href: "/habits", label: "Habits", icon: RefreshCcw },
  null,
  { href: "/review", label: "Reviews", icon: Compass },
  { href: "/goals", label: "Goals & values", icon: Heart },
  null,
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-line bg-surface">
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
            </div>
          )}
        </div>

        {/* Quick add */}
        <div className="p-3">
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
        </div>

        {/* Nav */}
        <nav className="thin-scroll flex-1 overflow-y-auto px-3 pb-3">
          {NAV.map((item, i) =>
            item === null ? (
              <div key={i} className="my-2 border-t border-line" />
            ) : (
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
            )
          )}
        </nav>

        {/* User */}
        <div className="flex items-center gap-2 border-t border-line p-3">
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
      </aside>

      <main className="ml-60 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
      </main>

      {quickAddOpen && <QuickAdd onClose={() => setQuickAddOpen(false)} />}
    </div>
  );
}
