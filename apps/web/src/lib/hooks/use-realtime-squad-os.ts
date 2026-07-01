"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Squad, Agent, Mission, Decision } from "@/lib/types/squad-os";

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

export function useRealtimeAgents(initialAgents: Agent[]): Agent[] {
  return useRealtimeTable<Agent>("agents", initialAgents);
}

export function useRealtimeMissions(initialMissions: Mission[]): Mission[] {
  return useRealtimeTable<Mission>("missions", initialMissions);
}

export function useRealtimeDecisions(initialDecisions: Decision[]): Decision[] {
  return useRealtimeTable<Decision>("decisions", initialDecisions);
}

// ---------- Combined hook for overview page ----------

export interface SquadOSRealtimeData {
  squads: Squad[];
  agents: Agent[];
  missions: Mission[];
  decisions: Decision[];
  loading: boolean;
}

export function useSquadOSRealtime(): SquadOSRealtimeData {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  const fetchAll = useCallback(async () => {
    try {
      const [s, a, m, d] = await Promise.all([
        fetch("/api/squad-os/squads").then((r) => r.json()).catch(() => []),
        fetch("/api/squad-os/agents").then((r) => r.json()).catch(() => []),
        fetch("/api/squad-os/missions").then((r) => r.json()).catch(() => []),
        fetch("/api/squad-os/decisions").then((r) => r.json()).catch(() => []),
      ]);
      setSquads(s);
      setAgents(a);
      setMissions(m);
      setDecisions(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel("squad-os-all")
      .on("postgres_changes", { event: "*", schema: "public", table: "squads" }, (payload) => {
        handleChange(setSquads, payload);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agents" }, (payload) => {
        handleChange(setAgents, payload);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "missions" }, (payload) => {
        handleChange(setMissions, payload);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, (payload) => {
        handleChange(setDecisions, payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const realtimeSquads = useRealtimeSquads(squads);
  const realtimeAgents = useRealtimeAgents(agents);
  const realtimeMissions = useRealtimeMissions(missions);
  const realtimeDecisions = useRealtimeDecisions(decisions);

  return {
    squads: realtimeSquads,
    agents: realtimeAgents,
    missions: realtimeMissions,
    decisions: realtimeDecisions,
    loading,
  };
}

// ---------- Helpers ----------

function handleChange<T extends { id: string }>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  payload: { eventType: string; new: unknown; old: unknown },
) {
  const event = payload.eventType as RealtimeEvent;
  const record = (payload.new ?? payload.old) as T;

  setter((prev) => {
    switch (event) {
      case "INSERT":
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
}
