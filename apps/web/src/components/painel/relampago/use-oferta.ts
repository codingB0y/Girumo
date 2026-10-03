"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRecarga } from "@/components/painel/home/ao-vivo/use-recarga";
import type { FilaEntrada, FilaOferta } from "@/components/painel/relampago/vitrine/fila-vitrine";

export type FilaPayload = { offer: FilaOferta; queue: FilaEntrada[]; me: string; now: string };

const MSG_CARREGAR = "Nao foi possivel carregar a fila.";

/**
 * Carrega a oferta relâmpago e a fila dela, e expõe as ações da vendedora.
 * `offerId` nulo = nada a buscar. Aba escondida não busca (egress do Supabase).
 */
export function useOferta(offerId: string | null, opcoes: { pollMs: number }) {
  const [dados, setDados] = useState<FilaPayload | null>(null);
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
    if (!offerId) return;
    const res = await fetch(`/api/relampago/offers/${offerId}`, { cache: "no-store" });
    if (!res.ok) {
      setErro(MSG_CARREGAR);
      return;
    }
    const payload = (await res.json()) as FilaPayload;
    deriva.current = new Date(payload.now).getTime() - Date.now();
    setDados(payload);
    setErro(null);
  }, [offerId]);

  useEffect(() => {
    carregar().catch(() => setErro(MSG_CARREGAR));
  }, [carregar]);

  const poll = useCallback(() => {
    carregar().catch(() => {});
  }, [carregar]);
  useRecarga(poll, opcoes.pollMs);

  // Segundo a segundo só para o cronômetro. O dado vem do poll.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const agora = new Date(Date.now() + deriva.current);

  async function agir(claimId: string, action: "contacted" | "sold" | "dropped") {
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
    if (!offerId) return;
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
    if (!offerId) return;
    setOcupado(true);
    try {
      await fetch(`/api/relampago/offers/${offerId}`, { method: "POST" });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  return { dados, erro, aviso, ocupado, agora, agir, pegarProxima, fechar, recarregar: carregar };
}
