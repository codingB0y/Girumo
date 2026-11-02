"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { romaneioDoPlano, type AssinaturaResumo } from "@/lib/painel/casca";
import { numero } from "@/lib/painel/grupos";
import { NAV_ALL, NAV_BARRA_DESKTOP, isNavItemActive } from "@/lib/painel-nav";
import { cn } from "@/lib/utils";
import { useCasca } from "./casca-context";
import { ListaDosModulos } from "./lista-dos-modulos";
import { useResumoDosModulos } from "./use-resumo-modulos";

/** undefined enquanto carrega; null sem assinatura ou com a API fora. Busca na primeira abertura. */
function useAssinatura(aberto: boolean): AssinaturaResumo | undefined {
  const [sub, setSub] = useState<AssinaturaResumo | undefined>(undefined);
  useEffect(() => {
    if (!aberto || sub !== undefined) return;
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
  }, [aberto, sub]);
  return sub;
}

/** Módulos que só moram no Mais: nenhum item da barra acende neles, então o botão acende. */
// Vendas está em NAV_ALL por causa da vendedora, mas o dono não a vê no Mais.
const SO_NO_MAIS = NAV_ALL.filter((item) => !NAV_BARRA_DESKTOP.includes(item) && item.modulo !== "vendas");

/**
 * "Mais" da barra de cima (spec G2, decisão 4): painel ancorado ao botão com
 * todos os módulos por verbo e o estado de cada um — a mesma lista da folha
 * "Mais" do celular — e o romaneio do plano no rodapé. Esc (devolvendo o foco
 * ao botão), clique fora, escolher um item e trocar de rota fecham. Não é modal.
 * Com o Recuperar ligado e gente esperando, o botão ganha um ponto até 1279 px:
 * dali em diante o item mora na barra e leva o contador (ponto, não número, para
 * o botão não crescer a 1024 px).
 */
export function MenuMais() {
  const pathname = usePathname();
  const { recuperar, liberacoes } = useCasca();
  // Add-on ligado mora na barra (xl+) e é ele que acende; o Mais só acende pelos que moram só nele.
  const noMais = SO_NO_MAIS.some(
    (item) => !(item.comOferta && liberacoes?.[item.comOferta]) && isNavItemActive(pathname, item.href),
  );
  const esperando = recuperar?.enabled ? recuperar.precisaDeVoce : 0;
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const dados = useResumoDosModulos(aberto);
  const sub = useAssinatura(aberto);

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      botao.current?.focus();
    };
    const aoClicar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative flex self-stretch">
      <button ref={botao} type="button" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((v) => !v)} className={cn("pn-barra__item", noMais && "pn-barra__item--ativo")}>
        Mais <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        {esperando > 0 && (
          <>
            <span className="pn-barra__ponto absolute right-1.5 top-3 xl:hidden" aria-hidden="true" />
            <span className="sr-only xl:hidden">{`, ${numero(esperando)} ${esperando === 1 ? "precisa" : "precisam"} de você no Recuperar`}</span>
          </>
        )}
      </button>
      {aberto && (
        <div id={id} data-testid="painel-menu-mais" className="pn-menu-mais">
          <h2 className="sr-only">Mais</h2>
          <nav aria-label="Todos os módulos" className="contents">
            <ListaDosModulos dados={dados} aoEscolher={() => setAberto(false)} classeDoGrupo="pn-menu-mais__grupo" classeDoItem="pn-menu-mais__item" />
          </nav>
          <Link href="/painel/configuracoes" data-testid="painel-romaneio" onClick={() => setAberto(false)} className="pn-menu-mais__rodape">
            {sub === undefined ? "…" : romaneioDoPlano(sub)}
          </Link>
        </div>
      )}
    </div>
  );
}
