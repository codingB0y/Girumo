"use client";

import { useCallback, useEffect, useState } from "react";

import { useConfirmacao } from "@/components/painel/confirmacao";
import { FunisVitrine, type CampanhaEscolha } from "@/components/painel/funis/funis-vitrine";
import type { FunnelOverview, FunnelOverviewItem } from "@/lib/funnels/overview";

type CampanhaApi = { slug?: string; id: string; name: string; groupIds?: string[] };

export default function PainelFunis() {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [overview, setOverview] = useState<FunnelOverview | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [campanhas, setCampanhas] = useState<CampanhaEscolha[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/funis", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setOverview((await res.json()) as FunnelOverview);
      setErro(null);
    } catch {
      setErro("Não deu pra carregar os funis. Recarregue a página.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function abrirNovoFunil() {
    setEscolhendo((atual) => !atual);
    if (campanhas.length > 0) return;
    const lista = (await fetch("/api/campanhas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])) as CampanhaApi[];
    setCampanhas(
      (Array.isArray(lista) ? lista : []).map((c) => ({ slug: c.slug ?? c.id, name: c.name, grupos: c.groupIds?.length ?? 0 })),
    );
  }

  async function cancelar(item: FunnelOverviewItem) {
    const ok = await pedirConfirmacao({
      titulo: "Cancelar o funil",
      texto: `Cancelar as ${item.pendentes.length} mensagens ainda agendadas de "${item.label}" (${item.campaign.name})? O que já saiu não volta.`,
      rotulo: "Cancelar funil",
      destrutivo: true,
    });
    if (!ok) return;
    setCancelando(item.runId);
    try {
      // Mesmo caminho do "Cancelar funil" da Agenda: uma chamada por mensagem.
      for (const id of item.pendentes) {
        const res = await fetch(
          `/api/campanhas/${encodeURIComponent(item.campaign.slug)}/messages/cancel?id=${encodeURIComponent(id)}`,
          { method: "PATCH" },
        );
        if (!res.ok) {
          setErro("Parte do funil não foi cancelada. Confira a lista e tente de novo.");
          break;
        }
      }
      await carregar();
    } finally {
      setCancelando(null);
    }
  }

  return (
    <>
      <FunisVitrine
        overview={overview}
        erro={erro}
        campanhas={campanhas}
        escolhendo={escolhendo}
        escolhida={escolhida}
        cancelando={cancelando}
        onNovoFunil={() => void abrirNovoFunil()}
        onEscolher={setEscolhida}
        onCancelar={(item) => void cancelar(item)}
      />
      {folhaDeConfirmacao}
    </>
  );
}
