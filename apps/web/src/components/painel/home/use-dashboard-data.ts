"use client";

import { useCallback, useEffect, useState } from "react";
import type { Group } from "@/lib/mock-data";
import type {
  Automation,
  Campanha,
  DashboardData,
  Disparo,
  Lead,
  Order,
  Schedule,
  Session,
  TenantSettings,
  TrackedLink,
} from "./types";

/** Forma crua de `/api/automations` — o store devolve snake_case. */
type RawAutomation = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  last_run_at: string | null;
};

function toAutomation(a: RawAutomation): Automation {
  return { id: a.id, name: a.name, trigger: a.trigger, enabled: a.enabled, lastRunAt: a.last_run_at };
}

type FetchResult<T> = { ok: true; data: T } | { ok: false };

/** Busca que separa "veio vazio" de "não deu pra buscar". */
async function loadJson<T>(url: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false };
  }
}

function asArray<T>(result: FetchResult<unknown>): T[] {
  return result.ok && Array.isArray(result.data) ? (result.data as T[]) : [];
}

export type LoadState =
  | { status: "loading" }
  | { status: "error" }
  /** `partial` = carregou, mas algum endpoint só de números falhou. */
  | { status: "ready"; data: DashboardData; partial: boolean };

export type DashboardDataHandle = {
  state: LoadState;
  reload: () => void;
  /** Grava a meta recém-salva sem refazer as sete buscas. */
  applySettings: (next: TenantSettings) => void;
  /** O lojista fechou o roteiro de ativação. */
  dismissOnboarding: () => void;
  /** Carimba o marco da ativação completa. Idempotente no servidor. */
  markOnboardingComplete: () => void;
};

export function useDashboardData(): DashboardDataHandle {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });

    const [
      groups,
      campanhas,
      links,
      leads,
      orders,
      schedules,
      disparos,
      automations,
      session,
      settings,
    ] = await Promise.all([
        loadJson<Group[]>("/api/groups"),
        loadJson<Campanha[]>("/api/campanhas"),
        loadJson<TrackedLink[]>("/api/links"),
        loadJson<Lead[]>("/api/leads"),
        loadJson<Order[]>("/api/orders"),
        loadJson<Schedule[]>("/api/schedules"),
        loadJson<Disparo[]>("/api/disparos"),
        loadJson<RawAutomation[]>("/api/automations"),
        loadJson<Session>("/api/session"),
        loadJson<TenantSettings>("/api/settings"),
      ]);

    // Estes três decidem entre onboarding e dashboard. Se algum falhar, não dá
    // pra decidir — e o palpite errado joga uma conta veterana de volta em
    // "Bem-vindo, conecte seu WhatsApp". Melhor admitir que não carregou.
    if (!session.ok || !campanhas.ok || !groups.ok) {
      setState({ status: "error" });
      return;
    }

    setState({
      status: "ready",
      partial:
        !links.ok ||
        !leads.ok ||
        !orders.ok ||
        !settings.ok ||
        !schedules.ok ||
        !disparos.ok ||
        !automations.ok,
      data: {
        groups: asArray<Group>(groups),
        campanhas: asArray<Campanha>(campanhas),
        links: asArray<TrackedLink>(links),
        leads: asArray<Lead>(leads),
        orders: asArray<Order>(orders),
        schedules: asArray<Schedule>(schedules),
        disparos: asArray<Disparo>(disparos),
        automations: asArray<RawAutomation>(automations).map(toAutomation),
        session: session.data ?? {},
        settingsOk: settings.ok,
        settings: {
          monthlyGoalContacts: (settings.ok ? settings.data?.monthlyGoalContacts : null) ?? null,
          monthlyGoalRevenue: (settings.ok ? settings.data?.monthlyGoalRevenue : null) ?? null,
          onboardingDismissedAt: (settings.ok ? settings.data?.onboardingDismissedAt : null) ?? null,
          onboardingCompletedAt: (settings.ok ? settings.data?.onboardingCompletedAt : null) ?? null,
        },
      },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applySettings = useCallback((next: TenantSettings) => {
    setState((s) => (s.status === "ready" ? { ...s, data: { ...s.data, settings: next } } : s));
  }, []);

  /**
   * Otimista: o card some na hora e o servidor confirma depois. Se o PATCH
   * falhar, o estado local segue e o card volta no próximo load — barulhento o
   * bastante pra notar, barato o bastante pra não valer um rollback na UI.
   */
  const patchOnboarding = useCallback(
    (body: Record<string, boolean>, patch: Partial<TenantSettings>) => {
      setState((s) =>
        s.status === "ready"
          ? { ...s, data: { ...s.data, settings: { ...s.data.settings, ...patch } } }
          : s,
      );
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    },
    [],
  );

  const dismissOnboarding = useCallback(() => {
    patchOnboarding({ onboardingDismissed: true }, { onboardingDismissedAt: new Date().toISOString() });
  }, [patchOnboarding]);

  const markOnboardingComplete = useCallback(() => {
    patchOnboarding({ onboardingCompleted: true }, { onboardingCompletedAt: new Date().toISOString() });
  }, [patchOnboarding]);

  return { state, reload: () => void load(), applySettings, dismissOnboarding, markOnboardingComplete };
}
