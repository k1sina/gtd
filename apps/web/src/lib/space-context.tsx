"use client";

import type { Space } from "@gtd/shared";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "./supabase/client";

interface SpaceContextValue {
  spaces: Space[];
  currentSpace: Space | null;
  setCurrentSpaceId: (id: string) => void;
  loading: boolean;
}

const SpaceContext = createContext<SpaceContextValue>({
  spaces: [],
  currentSpace: null,
  setCurrentSpaceId: () => {},
  loading: true,
});

const STORAGE_KEY = "clarity.currentSpaceId";

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY)
  );

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ["spaces"],
    queryFn: async (): Promise<Space[]> => {
      const { data, error } = await supabase
        .from("spaces")
        .select("*")
        .order("is_personal", { ascending: false })
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const currentSpace = useMemo(() => {
    if (spaces.length === 0) return null;
    return spaces.find((s) => s.id === selectedId) ?? spaces[0] ?? null;
  }, [spaces, selectedId]);

  const setCurrentSpaceId = (id: string) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  // Realtime: when someone else changes work items in the current space,
  // refresh the local cache. RLS scopes the stream to visible rows.
  const qc = useQueryClient();
  const currentSpaceId = currentSpace?.id;
  useEffect(() => {
    if (!currentSpaceId) return;
    const channel = supabase
      .channel(`space-${currentSpaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `space_id=eq.${currentSpaceId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["tasks", currentSpaceId] })
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comments",
          filter: `space_id=eq.${currentSpaceId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["task_comments"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId]);

  return (
    <SpaceContext.Provider
      value={{ spaces, currentSpace, setCurrentSpaceId, loading: isLoading }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

export function useSpace() {
  return useContext(SpaceContext);
}
