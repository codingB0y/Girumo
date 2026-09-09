"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FilaVitrine } from "@/components/painel/relampago/vitrine/fila-vitrine";

type Offer = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
  opened_at?: string | null;
};

type Claim = {
  id: string;
  seller_user_id: string;
  claimed_at: string;
  contacted_at: string | null;
};

type Entry = {
  id: string;
  participant_jid: string;
  phone: string | null;
  push_name: string | null;
  message_text: string;
  commented_at: string;
  deprioritized_at: string | null;
  outcome: "sold" | "dropped" | null;
  claim: Claim | null;
};

type Payload = { offer: Offer; queue: Entry[]; me: string; now: string };

const POLL_MS = 5000;

export function FilaClient({ offerId }: { offerId: string }) {
  const [dados, setDados] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Só força o re-render do cronômetro; o valor não é lido.
  const [, setTick] = useState(0);

  /**
   * Diferença entre o relógio do servidor e o do navegador, medida na resposta.
   * O cronômetro conta a partir daqui e não de `Date.now()` cru: máquina de loja
   * com hora torta mostraria a reserva vencida (ou eterna) sem nada estar errado.
   */
  const deriva = useRef(0);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/relampago/offers/${offerId}`, { cache: "no-store" });
    if (!res.ok) {
      setErro("Nao foi possivel carregar a fila.");
      return;
    }
    const payload = (await res.json()) as Payload;
    deriva.current = new Date(payload.now).getTime() - Date.now();
    setDados(payload);
    setErro(null);
  }, [offerId]);

  useEffect(() => {
    carregar().catch(() => setErro("Nao foi possivel carregar a fila."));
    const id = setInterval(() => {
      carregar().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [carregar]);

  // Segundo a segundo só para o cronômetro. O dado vem do poll.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const agora = new Date(Date.now() + deriva.current);

  async function acao(claimId: string, action: "contacted" | "sold" | "dropped") {
    setOcupado(true);
    try {
      await fetch(`/api/relampago/claims/${claimId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function pegarProxima() {
    setOcupado(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/relampago/offers/${offerId}/claim`, { method: "POST" });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        // 409 não é erro: outra vendedora ganhou a corrida. Recarrega e segue.
        setAviso(corpo?.error ?? "Nao foi possivel pegar a proxima.");
      }
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function fechar() {
    setOcupado(true);
    try {
      await fetch(`/api/relampago/offers/${offerId}`, { method: "POST" });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  if (erro) {
    return <p className="px-4 py-8 text-sm text-alerta sm:px-8">{erro}</p>;
  }

  if (!dados) {
    return (
      <div className="px-4 py-8 sm:px-8" role="status" aria-label="Carregando a oferta">
        <div className="pn-skeleton h-64 rounded-xl" data-testid="painel-skeleton" />
      </div>
    );
  }

  const { offer, queue, me } = dados;

  return (
    <FilaVitrine
      oferta={offer}
      fila={queue}
      me={me}
      agora={agora}
      ocupado={ocupado}
      aviso={aviso}
      aoPegarProxima={() => void pegarProxima()}
      aoAgir={acao}
      aoFechar={() => void fechar()}
    />
  );
}
