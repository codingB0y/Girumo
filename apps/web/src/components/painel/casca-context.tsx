"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Liberacoes } from "@/lib/painel-nav";

/** O que `GET /api/ig/status` devolve. */
export type StatusInstagram = {
  enabled: boolean;
  account: { username: string; status: string } | null;
  live: number;
};

type CascaCtx = {
  /** Modo foco: a tela toma a janela inteira (editor de fluxo). A barra de cima e a barra inferior somem. */
  foco: boolean;
  definirFoco: (ligado: boolean) => void;
  /** null enquanto a casca não perguntou; com a API fora vira `enabled: false`. */
  instagram: StatusInstagram | null;
  liberacoes: Liberacoes | null;
  recarregarInstagram: () => void;
};

const CascaContext = createContext<CascaCtx>({
  foco: false,
  definirFoco: () => {},
  instagram: null,
  liberacoes: null,
  recarregarInstagram: () => {},
});

export const useCasca = () => useContext(CascaContext);

/** Liga o modo foco enquanto o componente estiver montado. */
export function useFoco() {
  const { definirFoco } = useCasca();
  useEffect(() => {
    definirFoco(true);
    return () => definirFoco(false);
  }, [definirFoco]);
}

const DESLIGADO: StatusInstagram = { enabled: false, account: null, live: 0 };

/**
 * O layout não remonta entre rotas, então o valor sobrevive à navegação: o
 * status do Instagram é uma pergunta por sessão do painel, e o item do menu
 * aparece (ou não) em todas as telas.
 */
export function CascaProvider({ children }: { children: React.ReactNode }) {
  const [foco, definirFoco] = useState(false);
  const [instagram, setInstagram] = useState<StatusInstagram | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregarInstagram = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/ig/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: StatusInstagram | null) => {
        if (cancelado) return;
        setInstagram(raw && typeof raw.enabled === "boolean" ? { enabled: raw.enabled, account: raw.account ?? null, live: Number(raw.live) || 0 } : DESLIGADO);
      })
      .catch(() => {
        if (!cancelado) setInstagram(DESLIGADO);
      });
    return () => {
      cancelado = true;
    };
  }, [versao]);

  const valor = useMemo<CascaCtx>(
    () => ({
      foco,
      definirFoco,
      instagram,
      liberacoes: instagram ? { instagram: instagram.enabled } : null,
      recarregarInstagram,
    }),
    [foco, instagram, recarregarInstagram],
  );
  return <CascaContext.Provider value={valor}>{children}</CascaContext.Provider>;
}
