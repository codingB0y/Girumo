"use client";

import { useCallback, useEffect, useState } from "react";
import type { Group } from "@/lib/mock-data";
import type { Parte } from "@/lib/painel/inicio-resposta";
import type {
  carregarAgendamentos,
  carregarCampanhas,
  carregarDisparos,
  carregarGrupos,
  carregarLeads,
  carregarLinks,
  carregarSessao,
} from "@/lib/painel/inicio-carga";
import type { listAutomations } from "@/lib/stores/automations";
import type { listOrdersByTenant } from "@/lib/stores/orders";
import type { getTenantSettings } from "@/lib/stores/tenant-settings";
import type {
  Automation,
  Campanha,
  DashboardData,
  Disparo,
  Lead,
  Order,
  Schedule,
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

/** Busca que separa "veio vazio" de "não deu pra buscar". */
async function loadJson<T>(url: string): Promise<Parte<T>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false };
  }
}

function asArray<T>(result: Parte<unknown>): T[] {
  return result.ok && Array.isArray(result.data) ? (result.data as T[]) : [];
}

/**
 * As dez partes de `/api/painel/inicio`. Cada uma diz se carregou: um array
 * vazio não distingue "sem nada" de "não deu pra buscar", e essa diferença é o
 * que separa a tela de erro do aviso de carga parcial.
 *
 * Os tipos saem das próprias funções de carga do servidor, e não de uma cópia
 * escrita à mão aqui: com dez partes numa resposta só, uma delas mudando de
 * forma lá passaria calada até aparecer torta na tela. Os `import type` são
 * apagados na compilação — nada de `server-only` entra no bundle do cliente.
 */
type Carga = {
  groups: Parte<Awaited<ReturnType<typeof carregarGrupos>>>;
  campanhas: Parte<Awaited<ReturnType<typeof carregarCampanhas>>>;
  links: Parte<Awaited<ReturnType<typeof carregarLinks>>>;
  leads: Parte<Awaited<ReturnType<typeof carregarLeads>>>;
  orders: Parte<Awaited<ReturnType<typeof listOrdersByTenant>>>;
  schedules: Parte<Awaited<ReturnType<typeof carregarAgendamentos>>>;
  disparos: Parte<Awaited<ReturnType<typeof carregarDisparos>>>;
  automations: Parte<Awaited<ReturnType<typeof listAutomations>>>;
  session: Parte<Awaited<ReturnType<typeof carregarSessao>>>;
  settings: Parte<Awaited<ReturnType<typeof getTenantSettings>>>;
};

const NAO_VEIO: Parte<never> = { ok: false };

/** Parte ausente na resposta conta como falha, não como estouro no render. */
function parte<T>(valor: Parte<T> | undefined): Parte<T> {
  return valor ?? NAO_VEIO;
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

    // Uma chamada, não dez: a rota agregada resolve o tenant uma vez e roda os
    // dez stores em paralelo no servidor. As dez rotas soltas continuam de pé
    // para as outras telas, chamando a mesma função de carga que esta usa.
    const carga = await loadJson<Carga>("/api/painel/inicio");
    if (!carga.ok) {
      setState({ status: "error" });
      return;
    }

    const groups = parte(carga.data.groups);
    const campanhas = parte(carga.data.campanhas);
    const links = parte(carga.data.links);
    const leads = parte(carga.data.leads);
    const orders = parte(carga.data.orders);
    const schedules = parte(carga.data.schedules);
    const disparos = parte(carga.data.disparos);
    const automations = parte(carga.data.automations);
    const session = parte(carga.data.session);
    const settings = parte(carga.data.settings);

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
