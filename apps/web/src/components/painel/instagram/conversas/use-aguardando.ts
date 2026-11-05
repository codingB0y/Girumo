"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRole } from "@/components/painel/role-provider";
import { tituloComContador, type AoVivo } from "@/lib/ig/conversas/tela";
import type { ListaDeConversas } from "@/lib/ig/conversas/tipos";
import { useAoVivoConversas } from "./use-ao-vivo";

/** Sem o Realtime, o contador da barra confere o índice a cada minuto (só com a aba visível). */
const CONSULTA_MS = 60_000;
const ESPERA_DA_CONSULTA_MS = 1500;

/**
 * O número de conversas "aguardando você" da barra de cima (spec Instagram §7.7), no padrão do contador do
 * Relâmpago: lê ao montar, atualiza pela mesma assinatura do Realtime da tela (ou, se ela cair, a cada minuto) e
 * põe "(N) " no título da aba do navegador. `ativo` falso (modo foco, sem Instagram, vendedora) não lê nada.
 */
export function useAguardandoNaBarra(ativo: boolean): { aguardando: number; aoVivo: AoVivo } {
  const { tenantId } = useRole();
  const [lido, setLido] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const consultar = useCallback(async () => {
    try {
      const r = await fetch("/api/ig/conversations?status=waiting", { cache: "no-store" });
      if (!r.ok) return;
      const corpo = (await r.json()) as Partial<ListaDeConversas>;
      if (typeof corpo.aguardando === "number") setLido(corpo.aguardando);
    } catch {
      // Falha na rede não zera o número: fica o último que se leu.
    }
  }, []);

  // Várias mudanças seguidas viram uma consulta só (cada uma custa saída do Supabase).
  const aoMudar = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void consultar(), ESPERA_DA_CONSULTA_MS);
  }, [consultar]);

  useEffect(() => {
    if (ativo) void consultar();
    return () => clearTimeout(timer.current);
  }, [ativo, consultar]);

  const aoVivo = useAoVivoConversas({ tenantId, ativo, aoMudar, aoConsultar: () => void consultar(), consultaMs: CONSULTA_MS });
  const aguardando = ativo ? lido : 0;

  // O Next reescreve o <title> a cada navegação: o observador põe o número de volta.
  useEffect(() => {
    const aplicar = () => {
      const novo = tituloComContador(document.title, aguardando);
      if (novo !== document.title) document.title = novo;
    };
    aplicar();
    const observador = new MutationObserver(aplicar);
    observador.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observador.disconnect();
      document.title = tituloComContador(document.title, 0);
    };
  }, [aguardando]);

  return { aguardando, aoVivo };
}
