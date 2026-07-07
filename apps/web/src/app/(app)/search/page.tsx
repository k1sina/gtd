"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState, Input } from "@/components/ui";
import { useSearch } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function SearchPage() {
  const { currentSpace } = useSpace();
  const [term, setTerm] = useState("");
  const { data: results = [], isFetching } = useSearch(currentSpace?.id, term);

  return (
    <div>
      <PageHeader title="Search" subtitle="Full-text search across your tasks" />
      <Input
        autoFocus
        placeholder="Search tasks and notes…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="mb-6 h-11 text-base"
      />
      {term.trim().length > 1 ? (
        <TaskList
          tasks={results}
          emptyState={
            <EmptyState
              icon={<Search size={22} />}
              title={isFetching ? "Searching…" : "No matches"}
            />
          }
        />
      ) : (
        <p className="text-sm text-ink-faint">Type at least two characters.</p>
      )}
    </div>
  );
}
