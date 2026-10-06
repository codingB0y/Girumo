"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleSlash, Link2Off } from "lucide-react";
import { numero } from "@/lib/painel/grupos";
import {
  entradaNaCelula,
  preenchimentoDaCelula,
  rotuloAcessivel,
  rotuloNaCelula,
  TEXTO_DO_ESTADO,
  type CelulaDoMapa,
} from "@/lib/painel/ao-vivo/mapa";
import { cn } from "@/lib/utils";

/**
 * Célula do mapa G2 (spec 2026-10-05, decisão 7): o número do grupo e o "+N" de hoje, sem percentual. A lotação
 * enche a célula de baixo para cima e a dica confirma o número. Lotou é Acid sólido na célula inteira (decisão 11;
 * o número em Volt lê 14,5:1 em cima dele); os outros estados usam um tom fraco da cor com um fio sólido no topo.
 * O Acid fica no `span` — nunca na classe do link (regra 10, e2e da casca).
 *
 * Sem convite = contorno vermelho + ícone no lugar do "+N". O vermelho é `saida`, a cor da série de saídas do
 * gráfico (5,4:1 sobre a superfície branca; fio pede 3:1). Sumiu do cadastro = contorno tracejado e ícone.
 *
 * Texto de 13 px (decisão 3). A partir de 768 px: 40 px de altura e a largura da coluna da grade (~61 px na mais
 * estreita, a 1400 px: tirando 3 px de cada lado e o fio de 1 px sobram ~53 px, e "142" + "99+" em Plex 13 px tabular
 * ocupam ~49 px; com 4 px de folga a barra de rolagem do Windows já cortava o "+N"), número e "+N" numa linha,
 * embaixo. No celular a coluna tem ~33 px: 36 px de altura, com o "+N" na segunda linha.
 */
const PREENCHIMENTO: Record<CelulaDoMapa["estado"], string> = {
  cheio: "bg-acid-500",
  quase: "bg-quase/25 border-t-2 border-quase",
  ativo: "bg-slate-600/20 border-t border-slate-600/60",
  sem_convite: "bg-slate-600/15",
  sumiu: "",
};

const BORDA: Record<CelulaDoMapa["estado"], string> = {
  cheio: "border-line-200",
  quase: "border-line-200",
  ativo: "border-line-200",
  sem_convite: "border-saida",
  sumiu: "border-dashed border-slate-600",
};

const CAIXA = [
  "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[4px] border bg-paper-0 px-0.5 py-[3px]",
  "text-13 leading-none tabular-nums text-volt-950",
  "md:flex-row md:items-end md:gap-0.5 md:rounded-md md:px-[3px] md:py-1",
].join(" ");

/**
 * Quando a dica aparece. WCAG 1.4.13: ela fecha com Esc sem tirar o foco/mouse, e o mouse pode ir da célula até ela
 * (a dica é filha do mesmo contêiner, então sair da célula para a dica não conta como sair).
 */
function useDicaAberta() {
  const [mouse, setMouse] = useState(false);
  const [foco, setFoco] = useState(false);
  const [dispensada, setDispensada] = useState(false);
  const aberta = (mouse || foco) && !dispensada;

  useEffect(() => {
    if (!mouse && !foco) setDispensada(false);
  }, [mouse, foco]);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDispensada(true);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta]);

  return {
    aberta,
    aoEntrar: () => setMouse(true),
    aoSair: () => setMouse(false),
    aoFocar: () => setFoco(true),
    aoDesfocar: () => setFoco(false),
  };
}

export function CelulaDoGrupo({ celula: c, bloco }: { celula: CelulaDoMapa; bloco: string }) {
  const { aberta, aoEntrar, aoSair, aoFocar, aoDesfocar } = useDicaAberta();

  return (
    <div data-testid="celula-do-grupo" className="relative h-9 md:h-10" onMouseEnter={aoEntrar} onMouseLeave={aoSair} onFocus={aoFocar} onBlur={aoDesfocar}>
      <Link
        href={c.href}
        aria-label={rotuloAcessivel(bloco, c)}
        className="block h-full w-full rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <span aria-hidden="true" className={cn(CAIXA, BORDA[c.estado])}>
          <span className={cn("absolute inset-x-0 bottom-0", PREENCHIMENTO[c.estado])} style={{ height: `${Math.round(preenchimentoDaCelula(c) * 100)}%` }} />
          <span className="relative font-semibold">{rotuloNaCelula(c)}</span>
          <span className="relative flex font-medium">
            {c.estado === "sem_convite" ? (
              <Link2Off className="h-3.5 w-3.5 text-saida" aria-hidden="true" />
            ) : c.estado === "sumiu" ? (
              <CircleSlash className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
            ) : (
              entradaNaCelula(c.entraram)
            )}
          </span>
        </span>
      </Link>
      {aberta && <Dica celula={c} />}
    </div>
  );
}

/**
 * A dica no hover e no foco do teclado. No celular não: a célula é um toque que já leva ao grupo, e a dica passaria
 * da borda da tela; o leitor de tela já tem tudo no aria-label. O pb-1.5 faz a ponte entre a célula e a caixa: o
 * mouse não passa por um vão ao subir até ela.
 */
function Dica({ celula: c }: { celula: CelulaDoMapa }) {
  return (
    <span aria-hidden="true" className="absolute bottom-full left-1/2 z-20 -translate-x-1/2 pb-1.5 max-md:hidden">
      <span className="block w-max max-w-[240px] rounded-md bg-volt-950 px-2.5 py-1.5 text-13 leading-snug text-paper-0 shadow-lg">
        <span className="block font-semibold">{c.nome}</span>
        {c.estado === "sumiu" ? (
          <span className="block">{TEXTO_DO_ESTADO.sumiu}</span>
        ) : (
          <span className="block tabular-nums">
            {numero(c.membros)} / {numero(c.capacidade)} · {Math.round(c.lotacao * 100)}% · {TEXTO_DO_ESTADO[c.estado]}
          </span>
        )}
        {(c.entraram > 0 || c.sairam > 0) && (
          <span className="block tabular-nums">
            hoje: +{numero(c.entraram)} −{numero(c.sairam)}
          </span>
        )}
        {c.novoAs && <span className="block">aberto hoje às {c.novoAs}</span>}
      </span>
    </span>
  );
}
