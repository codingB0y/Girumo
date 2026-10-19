import { useCallback, useEffect, useRef, useState } from "react";
import type { BulkAction } from "@/lib/groups/bulk-batch";

/**
 * Progresso do lote mais recente de ações em massa da campanha
 * (`GET /api/campanhas/[slug]/grupos/lotes`) — o "47 de 91".
 *
 * Saiu de `acoes-em-massa.tsx` para o Padronizar acompanhar os renomes pelo
 * mesmo caminho. Polling de 3s enquanto houver job pendente, e não realtime: o
 * realtime do app é decorativo, e uma barra pendurada nele nunca se moveria.
 * Busca no mount para reencontrar um lote em andamento depois de um F5 — com 91
 * grupos o lote leva ~6 min, então recarregar no meio é o caso comum.
 */

export type ProgressoDoLote = {
  batchId: string;
  actions: BulkAction[];
  createdAt: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
};

/** Ritmo do executor: 1 operação a cada 4s ≈ 15/min. */
export const OPS_POR_MINUTO = 15;
const POLL_MS = 3000;

export function useProgressoDoLote(slug: string, onLoteConcluido?: () => void) {
  const [progresso, setProgresso] = useState<ProgressoDoLote | null>(null);
  // Guarda o pendente da batida anterior: a transição >0 -> 0 é o fim do lote.
  const pendenteAnterior = useRef<number | null>(null);

  const lerProgresso = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/lotes`);
      if (!res.ok) return;
      const dado = (await res.json()) as ProgressoDoLote | null;
      setProgresso(dado);

      const antes = pendenteAnterior.current;
      pendenteAnterior.current = dado?.pending ?? null;
      if (antes !== null && antes > 0 && dado && dado.pending === 0) onLoteConcluido?.();
    } catch {
      // Uma batida perdida não é erro de tela: a próxima corrige.
    }
  }, [slug, onLoteConcluido]);

  useEffect(() => {
    lerProgresso();
  }, [lerProgresso]);

  useEffect(() => {
    if (!progresso || progresso.pending === 0) return;
    const id = setInterval(lerProgresso, POLL_MS);
    return () => clearInterval(id);
  }, [progresso, lerProgresso]);

  return { progresso, lerProgresso };
}
