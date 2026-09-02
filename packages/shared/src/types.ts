// Core domain types, mirroring the Supabase schema.

export type TaskStatus =
  | "inbox"
  | "next"
  | "waiting"
  | "scheduled"
  | "someday"
  | "done"
  | "cancelled";

export type Energy = "low" | "medium" | "high";

export type SpaceRole = "owner" | "member";

export type ReviewType = "weekly" | "quarterly";

export type GoalStatus = "active" | "achieved" | "partial" | "dropped";

/** Lifetime-map experiences: what you want to live, and when in your life. */
export type ExperienceCategory =
  | "travel"
  | "adventure"
  | "craft"
  | "people"
  | "create"
  | "wellbeing"
  | "contribute"
  | "other";

/**
 * `dream` — wanted, not yet placed in time. `planned` — given a window.
 * `active` — under way. `lived` — done. `released` — consciously let go,
 * which is the other half of choosing.
 */
export type ExperienceStatus =
  | "dream"
  | "planned"
  | "active"
  | "lived"
  | "released";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Space {
  id: string;
  name: string;
  is_personal: boolean;
  created_by: string;
  created_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: SpaceRole;
  created_at: string;
}

export interface Task {
  id: string;
  space_id: string;
  parent_task_id: string | null;
  created_by: string;
  assigned_to: string | null;
  title: string;
  notes: string | null;
  outcome: string | null; // GTD: what does "done" look like? (parents of subtasks)
  status: TaskStatus;
  urgency: number; // 1..4
  importance: number; // 1..4
  due_at: string | null;
  defer_until: string | null;
  estimated_minutes: number | null;
  energy: Energy | null;
  context_tags: string[];
  waiting_on: string | null;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  sort_order: number;
  completed_at: string | null;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  space_id: string;
  created_by: string;
  name: string;
  // Days of week the habit is scheduled for; 0 = Monday … 6 = Sunday.
  // Empty array = every day.
  weekdays: number[];
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface HabitLog {
  habit_id: string;
  user_id: string;
  log_date: string; // YYYY-MM-DD
  created_at: string;
}

export interface LifeValue {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  value_id: string | null;
  title: string;
  description: string | null;
  year: number;
  quarter: number; // 1..4
  status: GoalStatus;
  score: number | null; // 0..10 set during quarterly review
  reflection: string | null;
  sort_order: number;
  created_at: string;
}

export interface LifeHorizon {
  user_id: string;
  birth_date: string | null; // YYYY-MM-DD
  life_expectancy: number; // the horizon you plan against, not a prediction
  created_at: string;
  updated_at: string;
}

export interface LifeExperience {
  id: string;
  user_id: string;
  value_id: string | null;
  title: string;
  notes: string | null;
  category: ExperienceCategory;
  status: ExperienceStatus;
  // Inclusive age window; both null = not placed in life yet.
  target_age_start: number | null;
  target_age_end: number | null;
  with_whom: string | null;
  lived_on: string | null; // YYYY-MM-DD
  reflection: string | null;
  sort_order: number;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  type: ReviewType;
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  checklist: Record<string, boolean>;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: unknown; // Claude content blocks (text / tool_use / tool_result)
  created_at: string;
}
