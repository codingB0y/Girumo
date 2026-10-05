"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Logo, LogoSymbol } from "@/components/brand/logo";
import { useCasca } from "@/components/painel/casca-context";
import { NotificationBell } from "@/components/painel/notification-bell";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import { iniciaisDaLoja } from "@/lib/painel/casca";
import { NAV_BARRA_DESKTOP, isNavItemActive, liberado } from "@/lib/painel-nav";
import { cn } from "@/lib/utils";
import { FolhaPostar } from "./folha-postar";
import { MenuMais } from "./menu-mais";

const DISPAROS = "/painel/disparos";
const RELAMPAGO = "/painel/relampago";
const REFRESCO_MS = 60_000;

type Oferta = { status?: string };

/**
 * Há oferta relâmpago no ar? Busca ao montar e quando a aba volta a ficar
 * visível depois de um minuto; o layout não remonta entre rotas.
 */
function useRelampagoNoAr(): boolean {
  const [noAr, setNoAr] = useState(false);
  useEffect(() => {
    let cancelado = false;
    let ultimaBusca = 0;
    async function buscar() {
      ultimaBusca = Date.now();
      const json = await fetch("/api/relampago/offers")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cancelado) return;
      const ofertas: Oferta[] = Array.isArray(json?.offers) ? json.offers : [];
      setNoAr(ofertas.some((o) => o.status === "open"));
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
  return noAr;
}

/**
 * Barra de cima (spec G2, decisão 4): a única peça Volt da casca. Desktop:
 * logo, loja, os seis módulos do dia, Mais, estado do número, sino, Postar e
 * avatar. Celular (52px): símbolo, loja, ponto do número e sino — a navegação
 * fica na barra inferior (decisão 5).
 */
export function BarraDeCima() {
  const pathname = usePathname();
  const { tenantName, carregado } = useRole();
  const { session, loading } = usePanelSession();
  const { foco, liberacoes } = useCasca();
  const noAr = useRelampagoNoAr();
  const [postar, setPostar] = useState(false);
  const idPostar = useId();
  const fechar = useCallback(() => setPostar(false), []);
  if (foco) return null;

  const nomeDaLoja = carregado ? (tenantName ?? "Sua loja") : "";
  const ponto = loading || !session ? "pn-ponto--indefinido" : session.live ? "pn-ponto--conectado pn-respira" : "pn-ponto--desconectado";
  const estado = loading || !session ? "Verificando…" : session.live ? "Conectado" : "Desconectado";
  const nomeDoNumero = !loading && session ? `Seu número: ${session.live ? "conectado" : "desconectado"}` : "Seu número";

  return (
    <>
      <header data-testid="painel-barra" className="pn-barra sticky top-0 z-20">
        <Link href="/painel" aria-label="Girumo, início" className="pn-barra__logo">
          <Logo className="hidden text-[20px] lg:inline-flex" title={null} />
          <LogoSymbol className="h-[22px] w-[22px] lg:hidden" />
        </Link>
        {carregado ? (
          <span data-testid="painel-barra-loja" title={nomeDaLoja} className="pn-barra__loja">
            {nomeDaLoja}
          </span>
        ) : (
          <span role="status" aria-label="Carregando nome da loja" className="pn-skeleton inline-block h-4 w-24 rounded-[var(--radius-chip)]" />
        )}

        <nav aria-label="Módulos" className="pn-barra__nav hidden lg:flex">
          {NAV_BARRA_DESKTOP.filter((item) => liberado(item, liberacoes)).map((item) => (
            <Link key={item.href} href={item.href} aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined} className="pn-barra__item">
              {item.curto ?? item.label}
              {item.href === RELAMPAGO && noAr && <span className="pn-barra__ponto" role="img" aria-label="oferta no ar" />}
            </Link>
          ))}
          <MenuMais />
        </nav>

        <div className="pn-barra__direita">
          <Link
            href="/painel/conectar"
            title={nomeDoNumero}
            aria-label={nomeDoNumero}
            aria-current={isNavItemActive(pathname, "/painel/conectar") ? "page" : undefined}
            className="pn-barra__numero"
          >
            <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
            <span className="pn-barra__numero-rotulo">{estado}</span>
          </Link>
          <NotificationBell />
          {pathname !== DISPAROS && (
            <button
              type="button"
              data-testid="painel-postar-barra"
              aria-haspopup="dialog"
              aria-expanded={postar}
              aria-controls={idPostar}
              onClick={() => setPostar(true)}
              className="pn-postar pn-barra__postar hidden lg:inline-flex"
            >
              Postar
            </button>
          )}
          <Link href="/painel/configuracoes" title="Configurações" aria-label={`Configurações · ${nomeDaLoja || "sua loja"}`} className="pn-barra__avatar hidden lg:grid">
            {carregado ? iniciaisDaLoja(tenantName) : ""}
          </Link>
        </div>
      </header>
      <FolhaPostar id={idPostar} aberta={postar} aoFechar={fechar} aoPostar={fechar} emQualquerLargura />
    </>
  );
}
