"use client";

import type { Goal, GoalStatus } from "@gtd/shared";
import clsx from "clsx";
import { Heart, Plus, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/task-list";
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  useDeleteGoal,
  useDeleteLifeValue,
  useGoals,
  useLifeValues,
  useSaveGoal,
  useSaveLifeValue,
} from "@/lib/data";
import { quarterOf } from "@/lib/format";

const STATUS_STYLE: Record<GoalStatus, string> = {
  active: "bg-accent-soft text-accent",
  achieved: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  dropped: "bg-black/5 text-ink-faint line-through",
};

export default function GoalsPage() {
  const { data: values = [] } = useLifeValues();
  const { data: goals = [] } = useGoals();
  const saveValue = useSaveLifeValue();
  const deleteValue = useDeleteLifeValue();
  const saveGoal = useSaveGoal();
  const deleteGoal = useDeleteGoal();

  const now = new Date();
  const current = quarterOf(now);

  const [valueDialog, setValueDialog] = useState(false);
  const [valueName, setValueName] = useState("");
  const [valueDesc, setValueDesc] = useState("");

  const [goalDialog, setGoalDialog] = useState<null | Partial<Goal>>(null);

  const goalsByQuarter = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      const key = `Q${g.quarter} ${g.year}`;
      map.set(key, [...(map.get(key) ?? []), g]);
    }
    return [...map.entries()];
  }, [goals]);

  async function submitValue() {
    if (!valueName.trim()) return;
    await saveValue.mutateAsync({
      name: valueName.trim(),
      description: valueDesc.trim() || null,
      sort_order: values.length,
    });
    setValueDialog(false);
    setValueName("");
    setValueDesc("");
  }

  async function submitGoal() {
    if (!goalDialog?.title?.trim()) return;
    await saveGoal.mutateAsync({
      ...goalDialog,
      title: goalDialog.title.trim(),
      year: goalDialog.year ?? current.year,
      quarter: goalDialog.quarter ?? current.quarter,
    });
    setGoalDialog(null);
  }

  return (
    <div>
      <PageHeader
        title="Goals & values"
        subtitle="The horizons above your projects — why you do what you do"
      />

      {/* Life values */}
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Heart size={15} className="text-rose-500" /> Life values
          </h2>
          <Button size="sm" onClick={() => setValueDialog(true)}>
            <Plus size={13} /> Add value
          </Button>
        </div>
        {values.length === 0 ? (
          <EmptyState
            icon={<Heart size={20} />}
            title="What matters most to you?"
            hint="Name 3–7 values (e.g. Family, Health, Craftsmanship). Goals link back to them."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {values.map((v) => (
              <div
                key={v.id}
                className="group rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium">{v.name}</h3>
                  <button
                    onClick={() => deleteValue.mutate(v.id)}
                    className="rounded p-1 text-ink-faint opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {v.description && (
                  <p className="mt-1 text-xs text-ink-soft">{v.description}</p>
                )}
                <p className="mt-2 text-[11px] text-ink-faint">
                  {goals.filter((g) => g.value_id === v.id && g.status === "active").length}{" "}
                  active goal(s)
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quarterly goals */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Target size={15} className="text-accent" /> Quarterly goals
          </h2>
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              setGoalDialog({ year: current.year, quarter: current.quarter })
            }
          >
            <Plus size={13} /> Add goal
          </Button>
        </div>

        {goals.length === 0 ? (
          <EmptyState
            icon={<Target size={20} />}
            title={`No goals for Q${current.quarter} ${current.year} yet`}
            hint="Set 2–4 outcomes for the quarter. Projects can link to them, and the quarterly review scores them."
          />
        ) : (
          goalsByQuarter.map(([label, list]) => (
            <div key={label} className="mb-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {label}
                {label === `Q${current.quarter} ${current.year}` && " · current"}
              </h3>
              <div className="flex flex-col gap-2">
                {list.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGoalDialog(g)}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left hover:border-accent cursor-pointer"
                  >
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLE[g.status]
                      )}
                    >
                      {g.status}
                    </span>
                    <span className="flex-1 text-sm font-medium">{g.title}</span>
                    {g.value_id && (
                      <span className="text-[11px] text-ink-faint">
                        {values.find((v) => v.id === g.value_id)?.name}
                      </span>
                    )}
                    {g.score != null && (
                      <span className="text-xs font-semibold text-ink-soft">
                        {g.score}/10
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* Value dialog */}
      <Dialog
        open={valueDialog}
        onClose={() => setValueDialog(false)}
        title="New life value"
      >
        <div className="flex flex-col gap-3 p-4">
          <Input
            autoFocus
            placeholder="Value (e.g. Family)"
            value={valueName}
            onChange={(e) => setValueName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitValue()}
          />
          <Textarea
            placeholder="What does living this value look like?"
            rows={2}
            value={valueDesc}
            onChange={(e) => setValueDesc(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
          <Button onClick={() => setValueDialog(false)}>Cancel</Button>
          <Button variant="primary" disabled={!valueName.trim()} onClick={submitValue}>
            Add value
          </Button>
        </div>
      </Dialog>

      {/* Goal dialog */}
      <Dialog
        open={!!goalDialog}
        onClose={() => setGoalDialog(null)}
        title={goalDialog?.id ? "Edit goal" : "New quarterly goal"}
      >
        {goalDialog && (
          <>
            <div className="flex flex-col gap-3 p-4">
              <Input
                autoFocus
                placeholder="Goal — a concrete outcome for the quarter"
                value={goalDialog.title ?? ""}
                onChange={(e) =>
                  setGoalDialog({ ...goalDialog, title: e.target.value })
                }
              />
              <Textarea
                placeholder="Why this, why now? How will you know it's done?"
                rows={2}
                value={goalDialog.description ?? ""}
                onChange={(e) =>
                  setGoalDialog({ ...goalDialog, description: e.target.value })
                }
              />
              <div className="grid grid-cols-3 gap-2">
                <Select
                  value={goalDialog.quarter ?? current.quarter}
                  onChange={(e) =>
                    setGoalDialog({ ...goalDialog, quarter: +e.target.value })
                  }
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q}
                    </option>
                  ))}
                </Select>
                <Select
                  value={goalDialog.year ?? current.year}
                  onChange={(e) =>
                    setGoalDialog({ ...goalDialog, year: +e.target.value })
                  }
                >
                  {[current.year - 1, current.year, current.year + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
                <Select
                  value={goalDialog.value_id ?? ""}
                  onChange={(e) =>
                    setGoalDialog({
                      ...goalDialog,
                      value_id: e.target.value || null,
                    })
                  }
                >
                  <option value="">No value link</option>
                  {values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
              {goalDialog.id && (
                <Select
                  value={goalDialog.status ?? "active"}
                  onChange={(e) =>
                    setGoalDialog({
                      ...goalDialog,
                      status: e.target.value as GoalStatus,
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="achieved">Achieved</option>
                  <option value="partial">Partially achieved</option>
                  <option value="dropped">Dropped</option>
                </Select>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
              {goalDialog.id ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    deleteGoal.mutate(goalDialog.id!);
                    setGoalDialog(null);
                  }}
                >
                  <Trash2 size={13} /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button onClick={() => setGoalDialog(null)}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={!goalDialog.title?.trim()}
                  onClick={submitGoal}
                >
                  Save goal
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
