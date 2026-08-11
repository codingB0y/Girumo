"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Clock,
  MessageSquare,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TRIGGER_LABELS } from "@/lib/automations/trigger-labels";

// Triggers de lifecycle do SaaS — nunca aparecem na tela do lojista (P0.7).
const RETIRED_LOJISTA_TRIGGERS = ["no_connect_24h", "trial_ending"];

type AutomationStep = {
  id: string;
  type: "message" | "wait" | "condition";
  delay_minutes: number;
  message?: string;
};

type Automation = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  steps: AutomationStep[];
  total_runs: number;
  last_run_at: string | null;
  created_at: string;
};

type Template = {
  name: string;
  trigger: string;
  steps: Omit<AutomationStep, "id">[];
};

// Espelha AUTOMATION_TEMPLATES de @/lib/stores/automations — mesma ordem,
// já que createFromTemplate() envia o índice pra API criar a partir de lá.
// Regra anti-ban (decisão Igor 2026-07-28): nenhum template manda DM, só posta no grupo.
const TEMPLATES: Template[] = [
  {
    name: "Boas-vindas no grupo",
    trigger: "lead_entered",
    steps: [
      { type: "wait", delay_minutes: 5 },
      { type: "message", delay_minutes: 0, message: "Bem-vindo(a) quem chegou agora! 👋 Aqui você vê as novidades primeiro. Pedido mínimo, catálogo e horários fixados no grupo." },
    ],
  },
  {
    name: "Novidade da semana",
    trigger: "weekly_recurring",
    steps: [
      { type: "message", delay_minutes: 0, message: "Chegou grade nova essa semana — olha as peças acima pra não perder as melhores." },
    ],
  },
  {
    name: "Grupo lotou",
    trigger: "group_full",
    steps: [
      { type: "message", delay_minutes: 0, message: "Esse grupo chegou no limite! 🎉 Já-já abrimos o próximo — fica de olho que o link sai aqui primeiro." },
    ],
  },
  {
    name: "Reativação de grupo parado",
    trigger: "group_stalled",
    steps: [
      { type: "message", delay_minutes: 0, message: "Semana de reposição: o que esgotou voltou. Pedidos por ordem de chegada." },
    ],
  },
];

function formatDelay(min: number): string {
  if (min === 0) return "Imediato";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)} dia(s)`;
}

export default function PainelAutomacoes() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  async function loadAutomations() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/automations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      setAutomations(
        Array.isArray(data)
          ? (data as Automation[]).filter((a) => !RETIRED_LOJISTA_TRIGGERS.includes(a.trigger))
          : [],
      );
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAutomations();
  }, []);

  async function createFromTemplate(index: number) {
    setCreating(true);
    setActionError(null);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateIndex: index }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const newAuto = await res.json();
      setAutomations((prev) => [newAuto, ...prev]);
      setShowTemplates(false);
    } catch {
      setActionError("Não foi possível criar a automação. Tente de novo.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setActionError(null);
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled } : a)));
    try {
      const res = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Reverte só o campo desta automação — não um snapshot inteiro, pra não
      // engolir updates otimistas concorrentes de outras linhas.
      setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)));
      setActionError("Não foi possível atualizar a automação. Tente de novo.");
    }
  }

  async function deleteAutomation(id: string) {
    const index = automations.findIndex((a) => a.id === id);
    const removed = automations[index];
    if (!removed) return;
    setActionError(null);
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/automations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setAutomations((prev) => {
        if (prev.some((a) => a.id === id)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });
      setActionError("Não foi possível excluir a automação. Verifique sua permissão e tente de novo.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-48 animate-pulse rounded-3xl bg-white" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <section className="rounded-3xl border border-dashed border-alerta/30 bg-white/50 px-6 py-16 text-center">
          <Zap className="mx-auto h-12 w-12 text-alerta/40" />
          <h3 className="font-display mt-4 text-lg font-bold text-volt-950">Não deu pra carregar as automações</h3>
          <p className="mt-1.5 text-sm text-aco/60">Verifique sua conexão e tente novamente.</p>
          <button
            onClick={() => void loadAutomations()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white shadow-brand transition hover:-translate-y-0.5 hover:bg-cobalt-500"
          >
            <RotateCcw className="h-4 w-4" /> Tentar de novo
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Automações</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Sequências automáticas por trigger
          </p>
        </div>
        <button
          onClick={() => setShowTemplates(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white shadow-brand transition hover:-translate-y-0.5 hover:bg-cobalt-500"
        >
          <Plus className="h-4 w-4" /> Nova automação
        </button>
      </div>

      {/* Erro de ação (criar/atualizar/excluir) */}
      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta"
        >
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            aria-label="Fechar aviso"
            className="rounded-lg px-2 py-0.5 font-medium transition hover:bg-alerta/10"
          >
            ✕
          </button>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-volt-950/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-volt-950/10 bg-white p-6 shadow-xl">
            <h2 className="font-display text-xl font-bold text-volt-950">Escolha um template</h2>
            <p className="mt-1 text-sm text-aco/60">Comece com um modelo pronto e personalize depois.</p>
            <div className="mt-5 space-y-3">
              {TEMPLATES.map((tpl, i) => {
                const trigger = TRIGGER_LABELS[tpl.trigger];
                return (
                  <button
                    key={tpl.name}
                    onClick={() => createFromTemplate(i)}
                    disabled={creating}
                    className="flex w-full items-center gap-4 rounded-xl border border-volt-950/[0.08] p-4 text-left transition hover:border-cobalt-500/30 hover:bg-cobalt-500/[0.03] disabled:opacity-50"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
                      <Zap className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-volt-950">{tpl.name}</p>
                      <p className="font-data mt-0.5 text-[11px] text-aco/55">
                        {trigger?.label ?? tpl.trigger} · {tpl.steps.length} passos
                      </p>
                    </div>
                    {creating && <Loader2 className="h-4 w-4 animate-spin text-cobalt-500" />}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowTemplates(false)}
              className="mt-4 w-full rounded-xl border border-volt-950/10 py-2.5 text-sm font-medium text-aco transition hover:bg-canvas-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de automações */}
      {automations.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-volt-950/10 bg-white/50 px-6 py-16 text-center">
          <Zap className="mx-auto h-12 w-12 text-aco/20" />
          <h3 className="font-display mt-4 text-lg font-bold text-volt-950">Nenhuma automação ativa</h3>
          <p className="mt-1.5 text-sm text-aco/60">
            Crie sua primeira automação pra enviar mensagens no automático.
          </p>
          <button
            onClick={() => setShowTemplates(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white shadow-brand transition hover:-translate-y-0.5 hover:bg-cobalt-500"
          >
            <Plus className="h-4 w-4" /> Criar automação
          </button>
        </section>
      ) : (
        <div className="space-y-4">
          {automations.map((auto) => {
            const trigger = TRIGGER_LABELS[auto.trigger];
            const TriggerIcon = trigger?.icon ?? Zap;
            return (
              <section
                key={auto.id}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white transition",
                  auto.enabled ? "border-volt-950/[0.08]" : "border-volt-950/[0.04] opacity-60",
                )}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", auto.enabled ? "bg-cobalt-500/10 text-cobalt-500" : "bg-canvas-100 text-aco/40")}>
                    <TriggerIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-volt-950">{auto.name}</p>
                    <p className="font-data mt-0.5 text-[11px] text-aco/55">
                      {trigger?.label ?? auto.trigger} · {auto.steps.length} passos · {auto.total_runs} execuções
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEnabled(auto.id, !auto.enabled)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition",
                        auto.enabled ? "bg-sucesso/10 text-sucesso hover:bg-sucesso/20" : "bg-canvas-100 text-aco/40 hover:bg-canvas-100/80",
                      )}
                      aria-label={auto.enabled ? "Desativar" : "Ativar"}
                    >
                      {auto.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => deleteAutomation(auto.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-aco/40 transition hover:bg-alerta/10 hover:text-alerta"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Steps preview */}
                <div className="border-t border-volt-950/[0.04] px-5 py-3">
                  <div className="flex flex-wrap gap-2">
                    {auto.steps.map((step) => (
                      <span
                        key={step.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-data text-[10px] uppercase tracking-wider",
                          step.type === "message" ? "bg-cobalt-500/[0.07] text-cobalt-500" : "bg-canvas-100 text-aco/50",
                        )}
                      >
                        {step.type === "message" ? <MessageSquare className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {step.type === "message" ? "Mensagem" : formatDelay(step.delay_minutes)}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
