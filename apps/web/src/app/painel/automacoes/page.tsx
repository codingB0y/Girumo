"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Clock,
  Users,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const TRIGGER_LABELS: Record<string, { label: string; icon: typeof Users }> = {
  lead_entered: { label: "Lead entrou no grupo", icon: Users },
  signup: { label: "Novo cadastro", icon: Users },
  no_connect_24h: { label: "24h sem conectar WhatsApp", icon: Clock },
  trial_ending: { label: "Trial acabando", icon: Clock },
  group_full: { label: "Grupo lotou", icon: Users },
};

const TEMPLATES: Template[] = [
  {
    name: "Boas-vindas ao grupo",
    trigger: "lead_entered",
    steps: [
      { type: "wait", delay_minutes: 5 },
      { type: "message", delay_minutes: 0, message: "👋 Oi! Bem-vind(a) ao grupo!" },
    ],
  },
  {
    name: "Nurturing 3 dias",
    trigger: "lead_entered",
    steps: [
      { type: "wait", delay_minutes: 5 },
      { type: "message", delay_minutes: 0, message: "👋 Bem-vind(a)!" },
      { type: "wait", delay_minutes: 1440 },
      { type: "message", delay_minutes: 0, message: "🔥 Já viu as novidades?" },
      { type: "wait", delay_minutes: 2880 },
      { type: "message", delay_minutes: 0, message: "✨ Novos produtos chegando!" },
    ],
  },
  {
    name: "Lembrete: conectar WhatsApp",
    trigger: "no_connect_24h",
    steps: [{ type: "message", delay_minutes: 0, message: "Conecte seu WhatsApp — leva 2 min!" }],
  },
  {
    name: "Trial acabando",
    trigger: "trial_ending",
    steps: [{ type: "message", delay_minutes: 0, message: "⏰ Seu trial termina em 2 dias!" }],
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
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    fetch("/api/automations")
      .then((r) => r.json())
      .then((d) => setAutomations(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createFromTemplate(index: number) {
    setCreating(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateIndex: index }),
      });
      if (res.ok) {
        const newAuto = await res.json();
        setAutomations((prev) => [newAuto, ...prev]);
        setShowTemplates(false);
      }
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled } : a)));
    await fetch("/api/automations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
  }

  async function deleteAutomation(id: string) {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/automations?id=${id}`, { method: "DELETE" });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 sm:px-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-white" />
        <div className="h-48 animate-pulse rounded-3xl bg-white" />
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
          className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
        >
          <Plus className="h-4 w-4" /> Nova automação
        </button>
      </div>

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-breu/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-breu/10 bg-white p-6 shadow-xl">
            <h2 className="font-display text-xl font-bold text-breu">Escolha um template</h2>
            <p className="mt-1 text-sm text-aco/60">Comece com um modelo pronto e personalize depois.</p>
            <div className="mt-5 space-y-3">
              {TEMPLATES.map((tpl, i) => {
                const trigger = TRIGGER_LABELS[tpl.trigger];
                return (
                  <button
                    key={tpl.name}
                    onClick={() => createFromTemplate(i)}
                    disabled={creating}
                    className="flex w-full items-center gap-4 rounded-xl border border-breu/[0.08] p-4 text-left transition hover:border-iris/30 hover:bg-iris/[0.03] disabled:opacity-50"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10 text-iris">
                      <Zap className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-breu">{tpl.name}</p>
                      <p className="font-data mt-0.5 text-[11px] text-aco/55">
                        {trigger?.label ?? tpl.trigger} · {tpl.steps.length} passos
                      </p>
                    </div>
                    {creating && <Loader2 className="h-4 w-4 animate-spin text-iris" />}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowTemplates(false)}
              className="mt-4 w-full rounded-xl border border-breu/10 py-2.5 text-sm font-medium text-aco transition hover:bg-bruma"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de automações */}
      {automations.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-breu/10 bg-white/50 px-6 py-16 text-center">
          <Zap className="mx-auto h-12 w-12 text-aco/20" />
          <h3 className="font-display mt-4 text-lg font-bold text-breu">Nenhuma automação ativa</h3>
          <p className="mt-1.5 text-sm text-aco/60">
            Crie sua primeira automação pra enviar mensagens no automático.
          </p>
          <button
            onClick={() => setShowTemplates(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
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
                  auto.enabled ? "border-breu/[0.08]" : "border-breu/[0.04] opacity-60",
                )}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", auto.enabled ? "bg-iris/10 text-iris" : "bg-bruma text-aco/40")}>
                    <TriggerIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-breu">{auto.name}</p>
                    <p className="font-data mt-0.5 text-[11px] text-aco/55">
                      {trigger?.label ?? auto.trigger} · {auto.steps.length} passos · {auto.total_runs} execuções
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEnabled(auto.id, !auto.enabled)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg transition",
                        auto.enabled ? "bg-sucesso/10 text-sucesso hover:bg-sucesso/20" : "bg-bruma text-aco/40 hover:bg-bruma/80",
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
                <div className="border-t border-breu/[0.04] px-5 py-3">
                  <div className="flex flex-wrap gap-2">
                    {auto.steps.map((step) => (
                      <span
                        key={step.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-data text-[10px] uppercase tracking-wider",
                          step.type === "message" ? "bg-iris/[0.07] text-iris" : "bg-bruma text-aco/50",
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
