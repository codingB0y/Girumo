"use client";

import { useEffect, useState } from "react";
import { AutomacoesVitrine } from "@/components/painel/automacoes/vitrine/automacoes-vitrine";
import { comEnabled, reinserirNaPosicao, visiveisParaOLojista } from "@/lib/painel/automacoes";
import type { Carga } from "@/lib/painel/types";

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
      { type: "message", delay_minutes: 0, message: "Chegou novidade essa semana — olha as ofertas acima pra não perder as melhores." },
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

export default function PainelAutomacoes() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadAutomations() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/automations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      // O filtro dos gatilhos de lifecycle do SaaS (P0.7) mora em
      // lib/painel/automacoes.ts — fonte única, com teste e mutante.
      setAutomations(Array.isArray(data) ? visiveisParaOLojista(data as Automation[]) : []);
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
    } catch {
      setActionError("Não foi possível criar a automação. Tente de novo.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setActionError(null);
    setAutomations((prev) => comEnabled(prev, id, enabled));
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
      setAutomations((prev) => comEnabled(prev, id, !enabled));
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
      setAutomations((prev) => reinserirNaPosicao(prev, removed, index));
      setActionError("Não foi possível excluir a automação. Verifique sua permissão e tente de novo.");
    }
  }

  // PR 11 da Vitrine Aberta: a automação vira peça com interruptor, e o modal
  // caseiro vira a Folha (que já tem Esc, foco preso e o resto da tela inerte).
  const carga: Carga = loading ? "carregando" : loadError ? "erro" : "ok";
  return (
    <AutomacoesVitrine
      automacoes={automations}
      carga={carga}
      criando={creating}
      erroDeAcao={actionError}
      templates={TEMPLATES}
      aoCriar={(indice) => void createFromTemplate(indice)}
      aoAlternar={(id, ligada) => void toggleEnabled(id, ligada)}
      aoExcluir={(id) => void deleteAutomation(id)}
      aoFecharAviso={() => setActionError(null)}
      aoTentarDeNovo={() => void loadAutomations()}
    />
  );
}
