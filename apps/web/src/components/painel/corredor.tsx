"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { usePanelSession } from "@/components/painel/session-provider";
import { romaneioDoPlano, type AssinaturaResumo } from "@/lib/painel/casca";
import { NAV_ALL, NAV_FOOTER, NAV_GRUPOS_ORDEM, NAV_GRUPO_TITULO, isNavItemActive, type NavItem } from "@/lib/painel-nav";
import { cn } from "@/lib/utils";

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const ativo = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    // aria-label explícito: recolhido, o rótulo visível sai e o nome não pode depender do title.
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={ativo ? "page" : undefined}
      className="pn-corredor__item"
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="pn-corredor__rotulo truncate">{item.label}</span>
    </Link>
  );
}

/** undefined enquanto carrega; null sem assinatura ou com a API fora. */
function useAssinatura(): AssinaturaResumo | undefined {
  const [sub, setSub] = useState<AssinaturaResumo | undefined>(undefined);
  useEffect(() => {
    let cancelado = false;
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelado) setSub(data ?? null);
      })
      .catch(() => {
        if (!cancelado) setSub(null);
      });
    return () => {
      cancelado = true;
    };
  }, []);
  return sub;
}

const RODAPE = NAV_FOOTER.map((i) => i.href);

/**
 * Corredor (spec 3.1): sidebar clara de 224px com os módulos por verbo
 * (Vender, Lotar, Loja), rodapé com Seu número, Configurações e o romaneio do
 * plano em mono 12. Abaixo de 1280px recolhe a 64px só com ícones (CSS).
 */
export function Corredor() {
  const pathname = usePathname();
  const { session, loading } = usePanelSession();
  const sub = useAssinatura();
  const { passos } = useCasca();
  const mostrarPassos = passos !== null && passos.feitos < passos.total;
  const ponto = loading || !session
    ? "pn-ponto--indefinido"
    : session.live
      ? "pn-ponto--conectado pn-respira"
      : "pn-ponto--desconectado";

  return (
    <aside data-testid="painel-corredor" className="pn-corredor sticky top-0 hidden h-screen shrink-0 flex-col lg:flex">
      <nav aria-label="Módulos" className="min-h-0 flex-1 overflow-y-auto py-2">
        {NAV_GRUPOS_ORDEM.map((grupo) => (
          <section key={grupo}>
            <h2 className="pn-corredor__grupo">{NAV_GRUPO_TITULO[grupo]}</h2>
            {NAV_ALL.filter((item) => item.grupo === grupo && !RODAPE.includes(item.href)).map((item) => (
              <Item key={item.href} item={item} pathname={pathname} />
            ))}
          </section>
        ))}
      </nav>

      <div className="pn-corredor__rodape">
        {/* O estado é o ponto (respira conectado, parado desconectado); texto ao lado não cabe em 224px. */}
        <Link
          href="/painel/conectar"
          title={!loading && session ? `Seu número: ${session.live ? "conectado" : "desconectado"}` : "Seu número"}
          aria-label={!loading && session ? `Seu número: ${session.live ? "conectado" : "desconectado"}` : "Seu número"}
          aria-current={isNavItemActive(pathname, "/painel/conectar") ? "page" : undefined}
          className="pn-corredor__item"
        >
          <span className="flex w-[18px] shrink-0 justify-center">
            <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
          </span>
          <span className="pn-corredor__rotulo truncate">Seu número</span>
        </Link>
        {NAV_FOOTER.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {/* Roteiro de ativação em uma linha (spec 3.1); some quando completa. */}
        {mostrarPassos && passos && (
          <Link href="/painel" data-testid="painel-passos" className="pn-corredor__passos" aria-label={`Primeiros passos: ${passos.feitos} de ${passos.total}`}>
            <span className="pn-corredor__rotulo">
              {passos.feitos} de {passos.total} passos
            </span>
            <span className="pn-corredor__passos-barra" aria-hidden="true" style={{ ["--p" as string]: passos.feitos / passos.total }} />
          </Link>
        )}
        <Link href="/painel/configuracoes" data-testid="painel-romaneio" className="pn-corredor__romaneio">
          {sub === undefined ? "…" : romaneioDoPlano(sub)}
        </Link>
      </div>
    </aside>
  );
}
