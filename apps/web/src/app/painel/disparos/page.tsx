"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComposerPayload } from "@/components/painel/messages/message-composer";
import type { SchedulePayload } from "@/components/painel/messages/schedule-composer";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { DisparosVitrine } from "@/components/painel/disparos/vitrine/disparos-vitrine";
import type { Group } from "@/lib/mock-data";

type Campanha = { id: string; name: string; slug?: string; groupIds: string[] };

export default function PainelDisparos() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [dispatches, setDispatches] = useState<TenantDispatchView[]>([]);
  const [campaignSlug, setCampaignSlug] = useState("");
  const [live, setLive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<Group[]>([]);
  // Sem isto, "0 pessoas veem" por falha de rede fica igual a campanha vazia.
  const [gruposOk, setGruposOk] = useState(true);
  // E sem ISTO, "ainda nao respondeu" fica igual a "respondeu vazio": os grupos
  // chegam depois das campanhas, e a tela afirmaria que eles sumiram da lista.
  const [gruposCarregando, setGruposCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/groups")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((g) => {
        if (vivo) setGrupos(Array.isArray(g) ? g : []);
      })
      .catch(() => {
        if (vivo) setGruposOk(false);
      })
      .finally(() => {
        if (vivo) setGruposCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const loadDispatches = useCallback(async () => {
    const d = await fetch("/api/disparos").then((r) => r.json()).catch(() => []);
    setDispatches(Array.isArray(d) ? d : []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        ]);
        const list: Campanha[] = Array.isArray(c) ? c : [];
        setCampanhas(list);
        setLive(Boolean(s?.live));
        // Pré-seleciona a 1ª campanha: com uma só, disparar vira um clique.
        if (list.length > 0) setCampaignSlug(list[0].slug ?? list[0].id);
        await loadDispatches();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadDispatches]);

  // Enquanto houver disparo em voo, o progresso vem do worker — só então vale
  // ficar consultando. Lista parada não gera tráfego.
  const emVoo = useMemo(
    () => dispatches.some((d) => d.status === "queued" || d.status === "running"),
    [dispatches],
  );
  useEffect(() => {
    if (!emVoo) return;
    const t = setInterval(loadDispatches, 10_000);
    return () => clearInterval(t);
  }, [emVoo, loadDispatches]);

  const campanhaAtual = useMemo(
    () => campanhas.find((c) => (c.slug ?? c.id) === campaignSlug) ?? null,
    [campanhas, campaignSlug],
  );

  async function dispatch(payload: ComposerPayload | SchedulePayload) {
    if (!campanhaAtual) return;
    setSending(true);
    setErro(null);
    try {
      const res = await fetch(`/api/campanhas/${campaignSlug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, groupIds: campanhaAtual.groupIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErro(err.error ?? "Não foi possível disparar.");
        return;
      }
      await loadDispatches();
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div
        className="mx-auto max-w-[1100px] space-y-4 px-4 py-8 sm:px-8"
        role="status"
        aria-label="Carregando os disparos"
      >
        <div className="pn-skeleton h-40 rounded-xl" data-testid="painel-skeleton" />
        <div className="pn-skeleton h-64 rounded-xl" data-testid="painel-skeleton" />
      </div>
    );
  }
  return (
    <DisparosVitrine
      campanhas={campanhas}
      slug={campaignSlug}
      aoTrocarCampanha={setCampaignSlug}
      grupos={grupos}
      gruposOk={gruposOk}
      gruposCarregando={gruposCarregando}
      disparos={dispatches}
      enviando={sending}
      erro={erro}
      live={live}
      aoDisparar={dispatch}
    />
  );
}
