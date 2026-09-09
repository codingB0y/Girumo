"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoSymbol } from "@/components/brand/logo";
import { NotificationBell } from "@/components/painel/notification-bell";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { textoDoTicker, type Entrada, type Ticker, type UltimoPost } from "@/lib/painel/casca";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";

type LeadLinha = { name?: string; sourceGroup?: string; enteredAt?: string };

const REFRESCO_MS = 60_000;

/**
 * Última entrada e último post. Busca ao montar e quando a aba volta a ficar
 * visível depois de um minuto: o ticker só troca em entrada real, e o layout
 * não remonta entre rotas.
 */
function useTicker(): Ticker | null {
  const [ticker, setTicker] = useState<Ticker | null>(null);

  useEffect(() => {
    let cancelado = false;
    let ultimaBusca = 0;

    async function buscar() {
      ultimaBusca = Date.now();
      const [leads, disparos] = await Promise.all([
        fetch("/api/leads?limit=1").then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<LeadLinha[]>,
        fetch("/api/disparos").then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<TenantDispatchView[]>,
      ]);
      if (cancelado) return;
      const lead = Array.isArray(leads) ? leads[0] : undefined;
      const entrada: Entrada | null = lead?.enteredAt
        ? { nome: lead.name, grupo: lead.sourceGroup, quando: lead.enteredAt }
        : null;
      const post = Array.isArray(disparos)
        ? disparos.find((d) => d.status === "sent" || d.status === "running")
        : undefined;
      const ultimoPost: UltimoPost | null = post
        ? { quando: post.dispatchedAt ?? post.createdAt, enviados: post.sent, total: post.total }
        : null;
      setTicker(textoDoTicker(entrada, ultimoPost));
    }

    void buscar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca > REFRESCO_MS) void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  return ticker;
}

/** Iniciais do avatar: nome da conta, senão o e-mail. */
function useIniciais(): string {
  const [iniciais, setIniciais] = useState("");
  useEffect(() => {
    let cancelado = false;
    fetch("/api/auth/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((conta: { name?: string; email?: string } | null) => {
        if (cancelado || !conta) return;
        const base = (conta.name || conta.email || "").trim();
        const partes = base.split(/[\s@.]+/).filter(Boolean);
        setIniciais(partes.slice(0, 2).map((p) => p[0]).join("").toUpperCase());
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);
  return iniciais;
}

/**
 * Letreiro (spec 3.1 e 3.2): a única peça escura do painel. 64px no desktop com
 * ticker de entradas, chip do número, sino e avatar; 56px no mobile só com
 * símbolo, nome da loja, ponto do número e sino.
 */
export function Letreiro() {
  const { tenantName } = useRole();
  const { session } = usePanelSession();
  const ticker = useTicker();
  const iniciais = useIniciais();
  const telefone = session?.live ? formatPhoneBR(session.phone) : null;
  const ponto = session
    ? session.live
      ? "pn-ponto--conectado pn-respira"
      : "pn-ponto--desconectado"
    : "pn-ponto--indefinido";

  return (
    <header data-testid="painel-letreiro" className="pn-letreiro sticky top-0 z-20">
      <Link href="/painel" className="flex min-w-0 shrink-0 items-center gap-2 lg:gap-3">
        <LogoSymbol className="h-[22px] w-[22px] shrink-0 lg:h-6 lg:w-6" title="Girumo" />
        <span className="pn-letreiro__loja truncate">{tenantName ?? "Sua loja"}</span>
      </Link>

      {ticker && (
        <p data-testid="painel-ticker" className="pn-letreiro__ticker hidden min-w-0 flex-1 lg:flex">
          {ticker.tipo === "entrada" && <span className="pn-ponto" aria-hidden="true" />}
          <span className="truncate">{ticker.texto}</span>
        </p>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-3">
        {session && (
          <Link
            href="/painel/conectar"
            aria-label={session.live ? "WhatsApp conectado" : "WhatsApp desconectado. Reconectar"}
            className="flex h-11 w-11 items-center justify-center lg:hidden"
          >
            <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
          </Link>
        )}
        {session && (
          <Link
            href="/painel/conectar"
            title={session.live ? (session.profileName ?? undefined) : "Reconectar WhatsApp"}
            className="pn-letreiro__chip hidden lg:inline-flex"
          >
            <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
            {session.live ? (telefone ?? session.profileName ?? "Conectado") : "Desconectado"}
          </Link>
        )}
        <NotificationBell tom="escuro" />
        <Link href="/painel/configuracoes" aria-label="Sua conta" className="pn-letreiro__avatar hidden lg:inline-flex">
          {iniciais || "•"}
        </Link>
      </div>
    </header>
  );
}
