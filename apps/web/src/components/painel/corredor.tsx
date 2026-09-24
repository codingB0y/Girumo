"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import { iniciaisDaLoja, romaneioDoPlano, type AssinaturaResumo } from "@/lib/painel/casca";
import { NAV_ALL, NAV_FOOTER, NAV_GRUPOS_ORDEM, NAV_GRUPO_TITULO, isNavItemActive, type NavItem } from "@/lib/painel-nav";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";

const CAMPANHAS_HREF = "/painel/campanhas";

type CampanhaMenu = { id: string; name: string; slug?: string; groupIds?: string[] };
type PerfilDoNumero = "novo" | "veterano";

function Item({ item, pathname, contagem }: { item: NavItem; pathname: string; contagem?: number }) {
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
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="pn-corredor__rotulo truncate">{item.label}</span>
      {contagem !== undefined && <span className="pn-corredor__contagem">{contagem}</span>}
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

/**
 * Campanhas abertas sob "Campanhas" (direção D). Busca de novo ao entrar na
 * área de campanhas, que é onde uma campanha nasce ou muda de nome.
 */
function useCampanhas(pathname: string): CampanhaMenu[] {
  const [lista, setLista] = useState<CampanhaMenu[]>([]);
  const naArea = pathname.startsWith(CAMPANHAS_HREF);
  useEffect(() => {
    let cancelado = false;
    fetch("/api/campanhas")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!cancelado) setLista(Array.isArray(data) ? (data as CampanhaMenu[]) : []);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [naArea]);
  return lista;
}

/** Perfil do número conectado; null sem número conectado ou com a API fora. */
function usePerfilDoNumero(): PerfilDoNumero | null {
  const [perfil, setPerfil] = useState<PerfilDoNumero | null>(null);
  useEffect(() => {
    let cancelado = false;
    fetch("/api/instances/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { numbers?: { connected: boolean; perfil: PerfilDoNumero }[] } | null) => {
        if (!cancelado) setPerfil(json?.numbers?.find((n) => n.connected)?.perfil ?? null);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);
  return perfil;
}

const RODAPE = NAV_FOOTER.map((i) => i.href);

/**
 * Corredor (direção D, spec 2026-09-24): trilho escuro de 248px com a loja no
 * topo, os módulos por verbo (Vender, Lotar, Loja), as campanhas abertas sob
 * "Campanhas" e o cartão do número no rodapé. Abaixo de 1280px recolhe a 64px
 * só com ícones (CSS).
 */
export function Corredor() {
  const pathname = usePathname();
  const { tenantName, carregado } = useRole();
  const { session, loading } = usePanelSession();
  const sub = useAssinatura();
  const campanhas = useCampanhas(pathname);
  const perfil = usePerfilDoNumero();
  const { passos } = useCasca();
  const mostrarPassos = passos !== null && passos.feitos < passos.total;
  const nomeDaLoja = carregado ? (tenantName ?? "Sua loja") : "";
  const ponto = loading || !session
    ? "pn-ponto--indefinido"
    : session.live
      ? "pn-ponto--conectado pn-respira"
      : "pn-ponto--desconectado";
  const estado = loading || !session ? "Verificando…" : session.live ? "Conectado" : "Desconectado";
  const telefone = session?.live ? formatPhoneBR(session.phone) : null;
  const nomeDoNumero = !loading && session ? `Seu número: ${session.live ? "conectado" : "desconectado"}` : "Seu número";

  return (
    <aside data-testid="painel-corredor" className="pn-corredor sticky top-0 hidden h-screen shrink-0 flex-col lg:flex">
      <Link href="/painel" title={nomeDaLoja || undefined} aria-label={nomeDaLoja ? `Início · ${nomeDaLoja}` : "Início"} className="pn-corredor__loja">
        <span className="pn-corredor__iniciais" aria-hidden="true">
          {carregado ? iniciaisDaLoja(tenantName) : ""}
        </span>
        {carregado ? (
          <span className="pn-corredor__loja-nome">{nomeDaLoja}</span>
        ) : (
          <span role="status" aria-label="Carregando nome da loja" className="pn-skeleton pn-corredor__loja-nome inline-block h-4 w-28 rounded-[var(--radius-chip)]" />
        )}
      </Link>

      <nav aria-label="Módulos" className="min-h-0 flex-1 overflow-y-auto py-1">
        {NAV_GRUPOS_ORDEM.map((grupo) => (
          <section key={grupo}>
            <h2 className="pn-corredor__grupo">{NAV_GRUPO_TITULO[grupo]}</h2>
            {NAV_ALL.filter((item) => item.grupo === grupo && !RODAPE.includes(item.href)).map((item) =>
              item.href === CAMPANHAS_HREF ? (
                <div key={item.href}>
                  <Item item={item} pathname={pathname} contagem={campanhas.length > 0 ? campanhas.length : undefined} />
                  {campanhas.length > 0 && (
                    <ul className="pn-corredor__sub" aria-label="Suas campanhas">
                      {campanhas.map((c) => {
                        const href = `${CAMPANHAS_HREF}/${c.slug ?? c.id}`;
                        const ativa = pathname === href || pathname.startsWith(`${href}/`);
                        const grupos = c.groupIds?.length ?? 0;
                        return (
                          <li key={c.id}>
                            <Link href={href} aria-current={ativa ? "page" : undefined} className="pn-corredor__subitem">
                              <span className="min-w-0 flex-1 truncate">{c.name}</span>
                              <span className="pn-corredor__contagem" aria-label={`${grupos} ${grupos === 1 ? "grupo" : "grupos"}`}>
                                {grupos}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : (
                <Item key={item.href} item={item} pathname={pathname} />
              ),
            )}
          </section>
        ))}
      </nav>

      <div className="pn-corredor__rodape">
        {/* Cartão do número: estado, perfil e telefone; recolhido, sobra o ponto. */}
        <Link
          href="/painel/conectar"
          title={nomeDoNumero}
          aria-label={nomeDoNumero}
          aria-current={isNavItemActive(pathname, "/painel/conectar") ? "page" : undefined}
          className="pn-corredor__numero"
        >
          <span className="pn-corredor__numero-estado">
            <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
            <span className="pn-corredor__rotulo">{estado}</span>
            {perfil && session?.live && <span className="pn-corredor__perfil">{perfil}</span>}
          </span>
          <span className="pn-corredor__numero-detalhe truncate">
            Seu número{telefone ? ` · ${telefone}` : ""}
          </span>
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
