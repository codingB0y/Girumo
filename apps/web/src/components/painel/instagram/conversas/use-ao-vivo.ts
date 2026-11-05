"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRole } from "@/components/painel/role-provider";
import { useRecarga } from "@/components/painel/home/ao-vivo/use-recarga";
import { ESPERA_DO_REALTIME_MS, proximoAoVivo, type AoVivo, type LinhaDoRealtime } from "@/lib/ig/conversas/tela";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Opcoes = {
  tenantId: string | null;
  ativo: boolean;
  /** Chegou uma mudança em `ig_conversations` (a linha nova, no formato do banco). */
  aoMudar: (linha: LinhaDoRealtime | null) => void;
  /** Consulta de reserva: a cada `consultaMs` com a aba visível enquanto o Realtime não está de pé. */
  aoConsultar: () => void;
  consultaMs: number;
};

/**
 * Supabase Realtime em `ig_conversations` (spec §7.1). Se a assinatura não conectar em 10 s, ou cair,
 * a tela passa a consultar a rota por tempo (só com a aba visível) e volta ao Realtime quando ele reconecta.
 * Devolve o estado para a tela expor em `data-ao-vivo`.
 */
export function useAoVivoConversas({ tenantId, ativo, aoMudar, aoConsultar, consultaMs }: Opcoes): AoVivo {
  const [estado, setEstado] = useState<AoVivo>("conectando");
  const instancia = useId();
  const { carregado } = useRole();
  // Os callbacks mudam a cada render; a assinatura não pode refazer por causa deles.
  const mudar = useRef(aoMudar);
  const consultar = useRef(aoConsultar);
  useEffect(() => {
    mudar.current = aoMudar;
    consultar.current = aoConsultar;
  });

  // Papel carregado e nenhuma loja: não há canal a assinar, então só a consulta mantém a tela viva.
  useEffect(() => {
    if (ativo && carregado && !tenantId) setEstado("consulta");
  }, [ativo, carregado, tenantId]);

  useEffect(() => {
    if (!ativo || !tenantId) return;
    let corrente = true;
    setEstado("conectando");
    const supabase = getSupabaseBrowserClient();
    // O CLOSED do removeChannel de uma assinatura antiga pode chegar depois do "conectando" da nova: só vale o canal corrente.
    const sinal = (s: "inscrito" | "caiu" | "vencido") => {
      if (corrente) setEstado((atual) => proximoAoVivo(atual, s));
    };
    const prazo = setTimeout(() => sinal("vencido"), ESPERA_DO_REALTIME_MS);
    // O nome leva a instância: dois `.on()` no mesmo canal já assinado derrubam a tela (ver o sino de avisos).
    const canal = supabase
      .channel(`ig-conversas-${tenantId}-${instancia}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ig_conversations", filter: `tenant_id=eq.${tenantId}` }, (payload) => mudar.current((payload.new as LinhaDoRealtime | undefined) ?? null))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") sinal("inscrito");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") sinal("caiu");
      });
    return () => {
      corrente = false;
      clearTimeout(prazo);
      void supabase.removeChannel(canal);
    };
  }, [ativo, tenantId, instancia]);

  // Quem ficou sem o Realtime pode ter perdido mudanças: confere uma vez ao entrar na consulta e outra ao voltar dela.
  const anterior = useRef<AoVivo>("conectando");
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = estado;
    if (!ativo) return;
    if (estado === "consulta" || (estado === "realtime" && antes === "consulta")) consultar.current();
  }, [estado, ativo]);

    // Estável: com função inline o intervalo recomeçaria a cada render e o de 60 s da barra nunca dispararia.
  const consultarAgora = useCallback(() => consultar.current(), []);
  useRecarga(consultarAgora, consultaMs, ativo && estado === "consulta");
  return estado;
}
