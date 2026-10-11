"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRole } from "./role-provider";

/**
 * Estado da sessão de WhatsApp compartilhado pelo chrome do painel
 * (topbar + sidebar), buscado uma única vez.
 *
 * `session === null` com `loading === false` significa "não deu pra saber"
 * (API fora, rede caiu) — que é diferente de `session.live === false`
 * ("sabemos que está desconectado"). A UI precisa dessa distinção pra não
 * gritar "desconectado!" quando na verdade não conseguiu perguntar.
 */
export type PanelSession = {
  live: boolean;
  phone: string | null;
  profileName: string | null;
};

type SessionState = {
  session: PanelSession | null;
  loading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function usePanelSession(): SessionState {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });
  const { carregado, acesso } = useRole();
  // O único leitor é o chip do número da barra, que a vendedora não tem; e a rota
  // daria 403 para ela sem `postar`. Os outros papéis perguntam depois do /api/auth/me.
  const pergunta = carregado && acesso?.role !== "seller";

  useEffect(() => {
    if (!pergunta) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        if (cancelled) return;
        setState({
          session: {
            live: raw?.live === true,
            phone: raw?.phone ? String(raw.phone) : null,
            profileName: raw?.profileName ? String(raw.profileName) : null,
          },
          loading: false,
        });
      } catch {
        if (!cancelled) setState({ session: null, loading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pergunta]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
