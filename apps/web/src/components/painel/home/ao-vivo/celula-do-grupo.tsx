"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleSlash, Link2Off } from "lucide-react";
import { numero } from "@/lib/painel/grupos";
import { entradaNoCelular, rotuloAcessivel, rotuloNoCelular, TEXTO_DO_ESTADO, type CelulaDoMapa } from "@/lib/painel/ao-vivo/mapa";
import { cn } from "@/lib/utils";

/**
 * A lotação enche a célula de baixo para cima. O preenchimento é um tom com a
 * cor do estado e um fio sólido no topo: com o tom fraco o número continua
 * legível em cima dele, e o fio ainda diz "lotou" de longe. O Acid fica no
 * `span` — nunca na classe do link (regra 10, e2e da casca).
 *
 * Sem convite = contorno vermelho + ícone. O vermelho é `saida`: tem tom próprio
 * no tema noite (7,2:1 na superfície; o `danger-700` dava 2,7:1 ali).
 * Sumiu do cadastro = contorno tracejado e a palavra "sumiu" na célula.
 */
const PREENCHIMENTO: Record<CelulaDoMapa["estado"], string> = {
  cheio: "bg-acid-500/25 border-t-2 border-acid-500",
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

export function CelulaDoGrupo({ celula: c, bloco }: { celula: CelulaDoMapa; bloco: string }) {
  // WCAG 1.4.13: a dica fecha com Esc sem tirar o foco/mouse, e o mouse pode ir da célula até ela
  // (a dica é filha do mesmo contêiner, então sair da célula para a dica não conta como sair).
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

  return (
    <div
      data-testid="celula-do-grupo"
      className="relative h-14 w-14 max-md:h-9 max-md:w-auto"
      onMouseEnter={() => setMouse(true)}
      onMouseLeave={() => setMouse(false)}
      onFocus={() => setFoco(true)}
      onBlur={() => setFoco(false)}
    >
      <Link
        href={c.href}
        aria-label={rotuloAcessivel(bloco, c)}
        className="block h-full w-full rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <span
          aria-hidden="true"
          className={cn("relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md border bg-paper-0 p-1 tabular-nums max-md:rounded-[4px] max-md:px-1 max-md:py-[3px]", BORDA[c.estado])}
        >
          <span className={cn("absolute inset-x-0 bottom-0", PREENCHIMENTO[c.estado])} style={{ height: `${Math.round(c.lotacao * 100)}%` }} />
          {c.estado === "sem_convite" && <Link2Off className="absolute right-1 top-1 h-3 w-3 text-saida max-md:hidden" aria-hidden="true" />}
          <span className="relative text-12 font-semibold leading-none text-volt-950">
            <span className="max-md:hidden">{c.rotulo}</span>
            <span className="md:hidden">{rotuloNoCelular(c)}</span>
          </span>
          <span className="relative leading-none text-volt-950">
            <span className="text-[11px] max-md:hidden">{c.novoAs ? `novo ${c.novoAs}` : c.entraram > 0 ? `+${numero(c.entraram)}` : ""}</span>
            {/* Celular (mockup .f-cx): o ícone de alerta ocupa a linha de baixo e vence o "+N"; o "novo HH:MM" vira a anotação do bloco. */}
            <span className="flex text-12 md:hidden">
              {c.estado === "sem_convite" ? (
                <Link2Off className="h-3 w-3 text-saida" aria-hidden="true" />
              ) : c.estado === "sumiu" ? (
                <CircleSlash className="h-3 w-3 text-slate-600" aria-hidden="true" />
              ) : (
                entradaNoCelular(c.entraram)
              )}
            </span>
          </span>
        </span>
      </Link>
      {/* Dica no hover e no foco do teclado (no celular não: a célula é um toque que já leva ao grupo, e a dica passaria da borda da tela); o leitor de tela já tem tudo no aria-label. O pb-1.5 faz a ponte
          entre a célula e a caixa: o mouse não passa por um vão ao subir até ela. */}
      {aberta && (
        <span aria-hidden="true" className="absolute bottom-full max-md:hidden left-1/2 z-20 -translate-x-1/2 pb-1.5">
          <span className="block w-max max-w-[220px] rounded-md bg-volt-950 px-2.5 py-1.5 text-12 leading-snug text-paper-0 shadow-lg">
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
      )}
    </div>
  );
}
