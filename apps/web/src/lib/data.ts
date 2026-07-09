"use client";

import type {
  Area,
  Goal,
  Habit,
  HabitLog,
  LifeValue,
  Project,
  Review,
  Space,
  Task,
  TaskStatus,
} from "@gtd/shared";
import { nextOccurrenceInsert } from "@gtd/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toDateKey } from "./format";
import { createClient } from "./supabase/client";

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function useTasks(spaceId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["tasks", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("space_id", spaceId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export interface NewTask {
  space_id: string;
  title: string;
  status?: TaskStatus;
  project_id?: string | null;
  parent_task_id?: string | null;
  notes?: string | null;
  urgency?: number;
  importance?: number;
  due_at?: string | null;
  defer_until?: string | null;
  estimated_minutes?: number | null;
  energy?: string | null;
  context_tags?: string[];
  waiting_on?: string | null;
  recurrence_rule?: string | null;
  sort_order?: number;
}

export function useCreateTask() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: NewTask): Promise<Task> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...task, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ["tasks", task.space_id] });
    },
  });
}

export function useUpdateTask() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<Task> & { id: string }): Promise<Task> => {
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = qc.getQueriesData<Task[]>({ queryKey: ["tasks"] });
      for (const [key, tasks] of snapshots) {
        if (!tasks) continue;
        qc.setQueryData(
          key,
          tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
        );
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, tasks] of ctx?.snapshots ?? []) {
        qc.setQueryData(key, tasks);
      }
    },
    onSettled: (task) => {
      if (task) qc.invalidateQueries({ queryKey: ["tasks", task.space_id] });
    },
  });
}

export function useDeleteTask() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/**
 * Complete (or un-complete) a task. Completing a recurring task spawns the
 * next occurrence with the same attributes and a due date computed from the
 * recurrence rule.
 */
export interface CompletionReceipt {
  /** What to restore on undo. */
  previousStatus: TaskStatus;
  previousCompletedAt: string | null;
  /** The recurrence occurrence spawned by this completion, if any. */
  spawnedId: string | null;
}

export function useCompleteTask() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      task,
      done,
    }: {
      task: Task;
      done: boolean;
    }): Promise<CompletionReceipt> => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: done ? "done" : "next",
          completed_at: done ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) throw error;

      let spawnedId: string | null = null;
      if (done && task.recurrence_rule) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const insert = nextOccurrenceInsert(task, user!.id);
        if (insert) {
          const { data: spawned, error: insertError } = await supabase
            .from("tasks")
            .insert(insert)
            .select("id")
            .single();
          if (insertError) throw insertError;
          spawnedId = spawned.id;
        }
      }
      return {
        previousStatus: task.status,
        previousCompletedAt: task.completed_at,
        spawnedId,
      };
    },
    onMutate: async ({ task, done }) => {
      await qc.cancelQueries({ queryKey: ["tasks", task.space_id] });
      const key = ["tasks", task.space_id];
      const prev = qc.getQueryData<Task[]>(key);
      if (prev) {
        qc.setQueryData(
          key,
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: (done ? "done" : "next") as TaskStatus,
                  completed_at: done ? new Date().toISOString() : null,
                }
              : t
          )
        );
      }
      return { prev, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, { task }) =>
      qc.invalidateQueries({ queryKey: ["tasks", task.space_id] }),
  });
}

/** Reverses a completion: restores the task and removes any spawned occurrence. */
export function useUndoComplete() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      task,
      receipt,
    }: {
      task: Task;
      receipt: CompletionReceipt;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: receipt.previousStatus,
          completed_at: receipt.previousCompletedAt,
        })
        .eq("id", task.id);
      if (error) throw error;
      if (receipt.spawnedId) {
        await supabase.from("tasks").delete().eq("id", receipt.spawnedId);
      }
    },
    onSettled: (_d, _e, { task }) =>
      qc.invalidateQueries({ queryKey: ["tasks", task.space_id] }),
  });
}

// ---------------------------------------------------------------------------
// Projects & areas
// ---------------------------------------------------------------------------

export function useProjects(spaceId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["projects", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("space_id", spaceId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProject() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (project: {
      space_id: string;
      name: string;
      outcome?: string | null;
      area_id?: string | null;
      goal_id?: string | null;
      status?: string;
    }): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .insert(project)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => qc.invalidateQueries({ queryKey: ["projects", p.space_id] }),
  });
}

export function useUpdateProject() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<Project> & { id: string }): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: (p) => {
      if (p) qc.invalidateQueries({ queryKey: ["projects", p.space_id] });
    },
  });
}

export function useDeleteProject() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useAreas(spaceId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["areas", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<Area[]> => {
      const { data, error } = await supabase
        .from("areas")
        .select("*")
        .eq("space_id", spaceId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateArea() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (area: { space_id: string; name: string }): Promise<Area> => {
      const { data, error } = await supabase
        .from("areas")
        .insert(area)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (a) => qc.invalidateQueries({ queryKey: ["areas", a.space_id] }),
  });
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export function useHabits(spaceId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["habits", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from("habits")
        .select("*")
        .eq("space_id", spaceId!)
        .is("archived_at", null)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateHabit() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (habit: {
      space_id: string;
      name: string;
      weekdays?: number[];
    }): Promise<Habit> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("habits")
        .insert({ ...habit, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (h) => qc.invalidateQueries({ queryKey: ["habits", h.space_id] }),
  });
}

export function useArchiveHabit() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("habits")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["habits"] }),
  });
}

/** Habit logs since a given date (inclusive) for the signed-in user. */
export function useHabitLogs(sinceDateKey: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["habit_logs", sinceDateKey],
    queryFn: async (): Promise<HabitLog[]> => {
      const { data, error } = await supabase
        .from("habit_logs")
        .select("*")
        .gte("log_date", sinceDateKey);
      if (error) throw error;
      return data;
    },
  });
}

export function useToggleHabitLog() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      habitId,
      date,
      done,
    }: {
      habitId: string;
      date: Date;
      done: boolean;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (done) {
        const { error } = await supabase.from("habit_logs").insert({
          habit_id: habitId,
          user_id: user!.id,
          log_date: toDateKey(date),
        });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("habit_logs")
          .delete()
          .eq("habit_id", habitId)
          .eq("user_id", user!.id)
          .eq("log_date", toDateKey(date));
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["habit_logs"] }),
  });
}

// ---------------------------------------------------------------------------
// Horizons: values, goals, reviews
// ---------------------------------------------------------------------------

export function useLifeValues() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["life_values"],
    queryFn: async (): Promise<LifeValue[]> => {
      const { data, error } = await supabase
        .from("life_values")
        .select("*")
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveLifeValue() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      value: Partial<LifeValue> & { name: string }
    ): Promise<LifeValue> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { id, ...fields } = value;
      const query = id
        ? supabase.from("life_values").update(fields).eq("id", id)
        : supabase.from("life_values").insert({ ...fields, user_id: user!.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["life_values"] }),
  });
}

export function useDeleteLifeValue() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("life_values").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["life_values"] }),
  });
}

export function useGoals() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["goals"],
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase
        .from("goals")
        .select("*")
        .order("year", { ascending: false })
        .order("quarter", { ascending: false })
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveGoal() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      goal: Partial<Goal> & { title?: string }
    ): Promise<Goal> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { id, ...fields } = goal;
      const query = id
        ? supabase.from("goals").update(fields).eq("id", id)
        : supabase.from("goals").insert({ ...fields, user_id: user!.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useDeleteGoal() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

export function useReviews(type?: "weekly" | "quarterly") {
  const supabase = createClient();
  return useQuery({
    queryKey: ["reviews", type ?? "all"],
    queryFn: async (): Promise<Review[]> => {
      let query = supabase
        .from("reviews")
        .select("*")
        .order("period_start", { ascending: false });
      if (type) query = query.eq("type", type);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveReview() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (review: Partial<Review>): Promise<Review> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { id, ...fields } = review;
      const query = id
        ? supabase.from("reviews").update(fields).eq("id", id)
        : supabase.from("reviews").insert({ ...fields, user_id: user!.id });
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}

// ---------------------------------------------------------------------------
// Calendar & time-blocking
// ---------------------------------------------------------------------------

export interface CalendarEventView {
  id: string;
  summary: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  busy: boolean;
}

export function useCalendarEvents(dateKey: string) {
  return useQuery({
    queryKey: ["calendar_events", dateKey],
    staleTime: 60_000,
    queryFn: async (): Promise<{
      connected: boolean;
      events: CalendarEventView[];
      reauthRequired?: boolean;
    }> => {
      const res = await fetch(`/api/calendar/events?date=${dateKey}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        return {
          connected: true,
          events: [],
          reauthRequired: body?.error === "google_reauth_required",
        };
      }
      return body;
    },
  });
}

export interface TimeBlockRow {
  id: string;
  task_id: string | null;
  starts_at: string;
  ends_at: string;
  status: "suggested" | "confirmed" | "synced" | "cancelled";
  calendar_event_id: string | null;
}

export function useTimeBlocks(dateKey: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["time_blocks", dateKey],
    queryFn: async (): Promise<TimeBlockRow[]> => {
      const start = new Date(`${dateKey}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from("time_blocks")
        .select("*")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .neq("status", "cancelled")
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });
}

export function usePlanDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, dateKey }: { spaceId: string; dateKey: string }) => {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, date: dateKey }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Planning failed");
      return res.json();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["time_blocks"] }),
  });
}

export function useConfirmPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blockIds: string[]) => {
      const res = await fetch("/api/plan/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockIds }),
      });
      if (!res.ok) throw new Error("Confirm failed");
      return res.json();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["time_blocks"] });
      qc.invalidateQueries({ queryKey: ["calendar_events"] });
    },
  });
}

export function useDismissPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dateKey: string) => {
      await fetch("/api/plan/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateKey }),
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["time_blocks"] }),
  });
}

export interface CalendarAccountRow {
  id: string;
  email: string;
  calendar_id: string;
  settings: Record<string, unknown>;
}

export function useCalendarAccount() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["calendar_account"],
    queryFn: async (): Promise<CalendarAccountRow | null> => {
      const { data, error } = await supabase
        .from("calendar_accounts")
        .select("id, email, calendar_id, settings")
        .eq("provider", "google")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateCalendarAccount() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string; calendar_id?: string; settings?: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("calendar_accounts")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["calendar_account"] });
      qc.invalidateQueries({ queryKey: ["calendar_events"] });
    },
  });
}

export function useDisconnectCalendar() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("calendar_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["calendar_account"] });
      qc.invalidateQueries({ queryKey: ["calendar_events"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Collaboration: spaces, members, invites, comments
// ---------------------------------------------------------------------------

export interface SpaceMemberRow {
  user_id: string;
  role: "owner" | "member";
  profile: { display_name: string; email: string } | null;
}

export function useSpaceMembers(spaceId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["space_members", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<SpaceMemberRow[]> => {
      const { data, error } = await supabase
        .from("space_members")
        .select("user_id, role, profile:profiles(display_name, email)")
        .eq("space_id", spaceId!);
      if (error) throw error;
      return data as unknown as SpaceMemberRow[];
    },
  });
}

export function useCreateSpace() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Space> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // The on_space_created trigger adds the creator as owner.
      const { data: space, error } = await supabase
        .from("spaces")
        .insert({ name, is_personal: false, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return space;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["spaces"] }),
  });
}

export interface SpaceInviteRow {
  id: string;
  email: string;
  token: string;
  accepted_at: string | null;
  created_at: string;
}

export function useSpaceInvites(spaceId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["space_invites", spaceId],
    enabled: !!spaceId,
    queryFn: async (): Promise<SpaceInviteRow[]> => {
      const { data, error } = await supabase
        .from("space_invites")
        .select("id, email, token, accepted_at, created_at")
        .eq("space_id", spaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateInvite() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      spaceId,
      email,
    }: {
      spaceId: string;
      email: string;
    }): Promise<SpaceInviteRow> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("space_invites")
        .insert({ space_id: spaceId, email, invited_by: user!.id })
        .select("id, email, token, accepted_at, created_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSettled: (_d, _e, v) =>
      qc.invalidateQueries({ queryKey: ["space_invites", v.spaceId] }),
  });
}

export function useRevokeInvite() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("space_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["space_invites"] }),
  });
}

export interface TaskCommentRow {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: { display_name: string } | null;
}

export function useTaskComments(taskId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["task_comments", taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskCommentRow[]> => {
      const { data, error } = await supabase
        .from("task_comments")
        .select("id, task_id, user_id, body, created_at, profile:profiles(display_name)")
        .eq("task_id", taskId!)
        .order("created_at");
      if (error) throw error;
      return data as unknown as TaskCommentRow[];
    },
  });
}

export function useAddTaskComment() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      spaceId,
      body,
    }: {
      taskId: string;
      spaceId: string;
      body: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId,
        space_id: spaceId,
        user_id: user!.id,
        body,
      });
      if (error) throw error;
    },
    onSettled: (_d, _e, v) =>
      qc.invalidateQueries({ queryKey: ["task_comments", v.taskId] }),
  });
}

// ---------------------------------------------------------------------------
// AI assistant chat
// ---------------------------------------------------------------------------

export interface ChatSessionRow {
  id: string;
  title: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant";
  content: unknown[];
  created_at: string;
}

export function useChatSessions() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["chat_sessions"],
    queryFn: async (): Promise<ChatSessionRow[]> => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
}

export function useChatMessages(sessionId: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["chat_messages", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatMessageRow[]> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", sessionId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      spaceId,
      message,
    }: {
      sessionId: string | null;
      spaceId: string;
      message: string;
    }): Promise<{ sessionId: string }> => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, spaceId, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "assistant_not_configured"
            ? "assistant_not_configured"
            : (data.error ?? "Assistant error")
        );
      }
      return data;
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["chat_sessions"] });
      qc.invalidateQueries({ queryKey: ["chat_messages"] });
      // The assistant may have changed tasks/projects/blocks.
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["time_blocks"] });
      void vars;
    },
  });
}

export function useDeleteChatSession() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["chat_sessions"] }),
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function useSearch(spaceId: string | undefined, term: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["search", spaceId, term],
    enabled: !!spaceId && term.trim().length > 1,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("space_id", spaceId!)
        // websearch_to_tsquery ANDs plain words and never throws on
        // operator characters (&, |, !, parens) in user input.
        .textSearch("search", term.trim(), { type: "websearch" })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Integration settings (Settings page: Anthropic key, Google OAuth client)
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  anthropic: { configured: boolean; source: "settings" | "env" | null };
  google: {
    configured: boolean;
    source: "settings" | "env" | null;
    client_id: string | null;
    redirect_uri: string;
  };
}

export function useIntegrationStatus() {
  return useQuery({
    queryKey: ["integration_status"],
    queryFn: async (): Promise<IntegrationStatus> => {
      const res = await fetch("/api/integrations/status");
      if (!res.ok) throw new Error("Failed to load integration status");
      return res.json();
    },
  });
}

export interface UserSettingsPatch {
  anthropic_api_key?: string | null;
  google_client_id?: string | null;
  google_client_secret?: string | null;
}

export function useSaveUserSettings() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UserSettingsPatch) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user!.id, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["integration_status"] }),
  });
}
