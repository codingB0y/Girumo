"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoSymbol } from "@/components/brand/logo";
import { NotificationBell } from "@/components/painel/notification-bell";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { textoDoTicker, type Entrada, type Ticker, type UltimoPost } from "@/lib/painel/casca";
import { tituloDaSecao } from "@/lib/painel-nav";
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

/**
 * Letreiro (direção D, spec 2026-09-24): barra de cima no fundo da página.
 * Desktop: nome da seção, ticker de entradas e sino (a loja e o número moram no
 * corredor). Mobile, 56px: símbolo, nome da loja, ponto do número e sino.
 */
export function Letreiro() {
  const pathname = usePathname();
  const { tenantName, carregado } = useRole();
  const { session } = usePanelSession();
  const ticker = useTicker();
  const ponto = session
    ? session.live
      ? "pn-ponto--conectado pn-respira"
      : "pn-ponto--desconectado"
    : "pn-ponto--indefinido";

  return (
    <header data-testid="painel-letreiro" className="pn-letreiro sticky top-0 z-20">
      <Link href="/painel" className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 lg:hidden">
        <LogoSymbol className="h-[22px] w-[22px] shrink-0" title="Girumo" />
        {carregado ? (
          <span className="pn-letreiro__loja truncate">{tenantName ?? "Sua loja"}</span>
        ) : (
          <span
            role="status"
            aria-label="Carregando nome da loja"
            className="pn-skeleton inline-block h-4 w-24 rounded-[var(--radius-chip)]"
          />
        )}
      </Link>
      <p className="pn-letreiro__secao hidden shrink-0 lg:block">{tituloDaSecao(pathname)}</p>

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
        <NotificationBell />
      </div>
    </header>
  );
}
