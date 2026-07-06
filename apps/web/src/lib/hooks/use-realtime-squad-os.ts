"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Squad, Mission, Decision } from "@/lib/types/squad-os";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

// ---------- Generic hook for any Squad OS table ----------

function useRealtimeTable<T extends { id: string }>(
  table: string,
  initialData: T[],
): T[] {
  const [data, setData] = useState<T[]>(initialData);

  // Sync when initialData changes (e.g., first fetch resolves)
  useEffect(() => {
    if (initialData.length > 0) {
      setData(initialData);
    }
  }, [initialData]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`squad-os-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          const event = payload.eventType as RealtimeEvent;
          const record = (payload.new ?? payload.old) as T;

          setData((prev) => {
            switch (event) {
              case "INSERT":
                // Avoid duplicates
                if (prev.some((item) => item.id === record.id)) return prev;
                return [...prev, record];
              case "UPDATE":
                return prev.map((item) =>
                  item.id === record.id ? { ...item, ...record } : item,
                );
              case "DELETE": {
                const deleted = payload.old as T;
                return prev.filter((item) => item.id !== deleted.id);
              }
              default:
                return prev;
            }
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);

  return data;
}
// ---------- Typed hooks ----------

export function useRealtimeSquads(initialSquads: Squad[]): Squad[] {
  return useRealtimeTable<Squad>("squads", initialSquads);
}

export function useRealtimeMissions(initialMissions: Mission[]): Mission[] {
  return useRealtimeTable<Mission>("missions", initialMissions);
}

export function useRealtimeDecisions(initialDecisions: Decision[]): Decision[] {
  return useRealtimeTable<Decision>("decisions", initialDecisions);
}
