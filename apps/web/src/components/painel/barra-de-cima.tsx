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
import { numero } from "@/lib/painel/grupos";
import { placarDaOferta, type EntradaLike } from "@/lib/painel/relampago";
import { NAV_BARRA_DESKTOP, isNavItemActive, liberado } from "@/lib/painel-nav";
import { cn } from "@/lib/utils";
import { FolhaPostar } from "./folha-postar";
import { MenuMais } from "./menu-mais";

const DISPAROS = "/painel/disparos";
const RELAMPAGO = "/painel/relampago";
const CONECTAR = "/painel/conectar";
const REFRESCO_MS = 60_000;

type Oferta = { id?: string; status?: string };
type Relampago = { noAr: boolean; esperando: number | null };
const QUIETO: Relampago = { noAr: false, esperando: null };

async function lerJson(url: string): Promise<unknown> {
  return fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** A oferta aberta e, se a fila vier, quantas pessoas esperam nela — duas leituras das rotas que já existem. */
async function lerRelampago(): Promise<Relampago> {
  const lista = (await lerJson("/api/relampago/offers")) as { offers?: Oferta[] } | null;
  const aberta = (Array.isArray(lista?.offers) ? lista.offers : []).find((o) => o.status === "open");
  if (!aberta?.id) return QUIETO;
  const detalhe = (await lerJson(`/api/relampago/offers/${aberta.id}`)) as { queue?: EntradaLike[] } | null;
  return { noAr: true, esperando: Array.isArray(detalhe?.queue) ? placarDaOferta(detalhe.queue).esperando : null };
}

/**
 * Há oferta relâmpago no ar, e quantas pessoas esperam na fila dela (spec G2, decisão 4)? Busca ao montar,
 * ao entrar ou sair de /relampago e quando a aba volta a ficar visível depois de um minuto; com oferta no
 * ar confere a cada minuto, porque ela fecha por tempo e a fila anda. O layout não remonta entre rotas.
 * `ativo` falso (modo foco) não busca nada.
 */
function useRelampagoNaBarra(ativo: boolean): Relampago {
  const naArea = usePathname().startsWith(RELAMPAGO);
  const [relampago, setRelampago] = useState<Relampago>(QUIETO);
  const noAr = relampago.noAr;
  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    let ultimaBusca = 0;
    async function buscar() {
      ultimaBusca = Date.now();
      const lido = await lerRelampago();
      if (!cancelado) setRelampago(lido);
    }
    void buscar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaBusca > REFRESCO_MS) void buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    const conferir = noAr
      ? setInterval(() => {
          if (document.visibilityState === "visible") void buscar();
        }, REFRESCO_MS)
      : undefined;
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      clearInterval(conferir);
    };
  }, [ativo, naArea, noAr]);
  return relampago;
}

const ESTADO_DO_NUMERO = {
  verificando: { texto: "Verificando…", ponto: "pn-ponto--indefinido" },
  conectado: { texto: "Conectado", ponto: "pn-ponto--conectado pn-respira" },
  desconectado: { texto: "Desconectado", ponto: "pn-ponto--desconectado" },
} as const;

/**
 * Estado do número: ponto e palavra (a cor sozinha não basta). Conectado vira
 * só o ponto abaixo de 1280px; os outros estados mantêm a palavra em toda largura.
 */
function ChipDoNumero() {
  const pathname = usePathname();
  const { session, loading } = usePanelSession();
  const estado = loading || !session ? "verificando" : session.live ? "conectado" : "desconectado";
  const { texto, ponto } = ESTADO_DO_NUMERO[estado];
  const nome = `${texto} · seu número`;
  return (
    <Link
      href={CONECTAR}
      title={nome}
      aria-label={nome}
      aria-current={isNavItemActive(pathname, CONECTAR) ? "page" : undefined}
      className={cn("pn-barra__numero", estado === "conectado" && "pn-barra__numero--ok")}
    >
      <span className={cn("pn-ponto", ponto)} aria-hidden="true" />
      <span className="pn-barra__numero-rotulo">{texto}</span>
    </Link>
  );
}

/** Oferta no ar: quantas pessoas esperam na fila (decisão 4); sem a fila lida, o ponto Paper de antes. */
function SinalDoRelampago({ noAr, esperando }: Relampago) {
  if (!noAr) return null;
  if (esperando === null) return <span className="pn-barra__ponto" role="img" aria-label="oferta no ar" />;
  return (
    <span className="pn-barra__contador">
      {numero(esperando)}
      <span className="sr-only"> esperando</span>
    </span>
  );
}

/** Os seis módulos do dia e o Mais; só no desktop (no celular a navegação é a barra inferior). */
function NavDaBarra({ relampago }: { relampago: Relampago }) {
  const pathname = usePathname();
  const { liberacoes } = useCasca();
  return (
    <nav aria-label="Módulos" className="pn-barra__nav hidden lg:flex">
      {NAV_BARRA_DESKTOP.filter((item) => liberado(item, liberacoes)).map((item) => (
        <Link key={item.href} href={item.href} aria-current={isNavItemActive(pathname, item.href) ? "page" : undefined} className="pn-barra__item">
          {item.curto ?? item.label}
          {item.href === RELAMPAGO && <SinalDoRelampago {...relampago} />}
        </Link>
      ))}
      <MenuMais />
    </nav>
  );
}

/**
 * Barra de cima (spec G2, decisão 4): a única peça Volt da casca. Desktop:
 * logo, loja, os seis módulos do dia, Mais, estado do número, sino, Postar e
 * avatar. Celular (52px): símbolo, loja, estado do número e sino — a navegação
 * fica na barra inferior (decisão 5).
 */
export function BarraDeCima() {
  const pathname = usePathname();
  const { tenantName, carregado } = useRole();
  const { foco } = useCasca();
  const relampago = useRelampagoNaBarra(!foco);
  const [postar, setPostar] = useState(false);
  const idPostar = useId();
  const fechar = useCallback(() => setPostar(false), []);
  if (foco) return null;

  const nomeDaLoja = carregado ? (tenantName ?? "Sua loja") : "";
  const iniciais = carregado ? iniciaisDaLoja(tenantName) : "";

  return (
    <>
      <header data-testid="painel-barra" className="pn-barra sticky top-0 z-20">
        <Link href="/painel" aria-label="Girumo, início" className="pn-barra__logo">
          <Logo className="hidden text-[20px] text-paper-0 lg:inline-flex" title={null} />
          <LogoSymbol className="h-[22px] w-[22px] lg:hidden" />
        </Link>
        {carregado ? (
          <span data-testid="painel-barra-loja" title={nomeDaLoja} className="pn-barra__loja">
            {nomeDaLoja}
          </span>
        ) : (
          <span role="status" aria-label="Carregando nome da loja" className="pn-skeleton inline-block h-4 w-24 rounded-[var(--radius-chip)]" />
        )}
        <NavDaBarra relampago={relampago} />
        <div className="pn-barra__direita">
          <ChipDoNumero />
          <NotificationBell />
          {pathname !== DISPAROS && (
            <button type="button" data-testid="painel-postar-barra" aria-haspopup="dialog" aria-expanded={postar} aria-controls={idPostar} onClick={() => setPostar(true)} className="pn-postar pn-barra__postar hidden lg:inline-flex">
              Postar
            </button>
          )}
          <Link href="/painel/configuracoes" title="Configurações" aria-label={iniciais ? `${iniciais} · Configurações da loja` : "Configurações da loja"} className="pn-barra__avatar hidden lg:grid">
            {iniciais}
          </Link>
        </div>
      </header>
      <FolhaPostar id={idPostar} aberta={postar} aoFechar={fechar} aoPostar={fechar} emQualquerLargura />
    </>
  );
}
