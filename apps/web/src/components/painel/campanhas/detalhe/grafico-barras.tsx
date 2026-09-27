"use client";

import { useState, type PointerEvent } from "react";
import { tetoDoEixo, type Barra } from "@/lib/painel/atividade";
import { cn } from "@/lib/utils";

export type MarcaNoGrafico = { id: string; posicao: number; hora: string; texto: string };

type Props = {
  barras: Barra[];
  /** O que o gráfico diz, em uma frase: vira o nome acessível. */
  resumo: string;
  /** O que cada barra conta, para a dica: ["pessoa nova", "pessoas novas"]. */
  unidade: [string, string];
  /** Rótulo do eixo a cada N barras: 24 horas não cabem em 390 px. */
  rotuloACada?: number;
  /** Onde fica agora no eixo (0 a 1), no gráfico de hoje. */
  agora?: number;
  /** Posts do dia: linha no minuto em que saíram, com a hora e o começo do texto. */
  marcas?: MarcaNoGrafico[];
  baixo?: boolean;
};

const pct = (valor: number, teto: number) => `${(valor / teto) * 100}%`;
/** Duas marcas mais perto que isto dividem a mesma linha de rótulo. */
const DISTANCIA_DOS_ROTULOS = 0.25;

/** Até duas linhas de rótulo; a marca que não cabe fica só com o traço. */
function linhasDosRotulos(marcas: MarcaNoGrafico[]): (0 | 1 | null)[] {
  const fim = [-1, -1];
  return marcas.map((m) => {
    for (const linha of [0, 1] as const) {
      if (m.posicao - fim[linha] >= DISTANCIA_DOS_ROTULOS) {
        fim[linha] = m.posicao;
        return linha;
      }
    }
    return null;
  });
}

/**
 * Colunas em HTML (não SVG): o texto do eixo fica em 12 px de verdade em
 * qualquer largura, em vez de encolher junto com o viewBox no celular.
 * A hora que ainda não chegou é um traço, nunca uma coluna zerada.
 */
export function GraficoDeBarras({ barras, resumo, unidade, rotuloACada = 1, agora, marcas = [], baixo = false }: Props) {
  const [ativa, setAtiva] = useState<number | null>(null);
  const n = barras.length;
  const teto = tetoDoEixo(Math.max(0, ...barras.map((b) => b.valor)));
  const pico = barras.reduce((m, b, i) => (b.valor > barras[m].valor ? i : m), 0);
  const atual = barras.findIndex((b) => b.atual);
  const primeiroFuturo = barras.findIndex((b) => b.futuro);
  const linhas = linhasDosRotulos(marcas);
  const faixaDasMarcas = marcas.length === 0 ? 0 : linhas.includes(1) ? 2 : 1;
  const mostraRotulo = (i: number) =>
    barras[i].rotulo !== "" && (i === atual || (i % rotuloACada === 0 && (atual < 0 || Math.abs(i - atual) > 1)));

  function apontar(e: PointerEvent<HTMLDivElement>) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - caixa.left) / caixa.width) * n);
    setAtiva(Math.min(n - 1, Math.max(0, i)));
  }

  const dica = ativa === null ? null : barras[ativa];
  const lado = ativa === null ? 0 : (ativa + 0.5) / n;

  return (
    <figure className="m-0">
      {faixaDasMarcas > 0 && (
        <div aria-hidden="true" className={cn("relative ml-9", faixaDasMarcas === 2 ? "h-10" : "h-5")}>
          {marcas.map((m, i) =>
            linhas[i] === null ? null : (
              <span
                key={m.id}
                className={cn(
                  "absolute flex max-w-[220px] items-baseline gap-1.5 whitespace-nowrap text-12 leading-5",
                  // Perto do fim, o rótulo cresce para a esquerda da linha e não invade o gráfico ao lado.
                  m.posicao > 0.6 && "-translate-x-full",
                )}
                style={{ left: `${m.posicao * 100}%`, top: linhas[i] === 1 ? 20 : 0 }}
              >
                <span className="shrink-0 font-semibold tabular-nums text-volt-950">{m.hora}</span>
                <span className="hidden min-w-0 truncate text-slate-600 sm:block">{m.texto}</span>
              </span>
            ),
          )}
        </div>
      )}
      <div className="flex gap-2">
        <div aria-hidden="true" className={cn("relative w-7 shrink-0 text-right text-12 tabular-nums leading-none text-slate-600", baixo ? "h-32" : "h-44")}>
          {/* O meio só ganha número quando é inteiro: "2,5 pessoas" não existe. */}
          {[teto, teto / 2, 0].map((m, i) =>
            Number.isInteger(m) ? (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
                {m.toLocaleString("pt-BR")}
              </span>
            ) : null,
          )}
        </div>
        <div
          className={cn("relative min-w-0 flex-1 touch-pan-y", baixo ? "h-32" : "h-44")}
          onPointerMove={apontar}
          onPointerDown={apontar}
          // No toque o "sair" vem logo depois de soltar o dedo: a dica fica até o próximo toque.
          onPointerLeave={(e) => e.pointerType !== "touch" && setAtiva(null)}
        >
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            <span className="block border-t border-line-200" />
            <span className="block border-t border-line-200" />
            <span className="block border-t border-slate-600/50" />
          </div>
          {primeiroFuturo > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 right-0 flex items-center justify-center bg-canvas-100/60"
              style={{ left: pct(primeiroFuturo, n) }}
            >
              {n - primeiroFuturo >= 4 && <span className="px-2 text-center text-12 text-slate-600">ainda não aconteceu</span>}
            </div>
          )}
          <ol role="img" aria-label={resumo} className="absolute inset-0 flex items-end gap-[3px]">
            {barras.map((b, i) => (
              <li key={b.chave} className={cn("relative flex h-full min-w-0 flex-1 items-end rounded-sm", i === ativa && "bg-hover-ficha")}>
                {b.futuro ? (
                  <span className="block h-0.5 w-full rounded-full bg-line-200" />
                ) : (
                  <span
                    className={cn("block w-full rounded-t-[2px] bg-serie", b.atual && "opacity-60")}
                    style={{ height: pct(b.valor, teto), minHeight: b.valor > 0 ? 2 : 0 }}
                  />
                )}
                {i === pico && b.valor > 0 && (
                  <span
                    className="absolute inset-x-0 text-center text-12 font-semibold tabular-nums text-volt-950"
                    style={{ bottom: `calc(${pct(b.valor, teto)} + 4px)` }}
                  >
                    {b.valor}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {marcas.map((m) => (
            <span
              key={m.id}
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-600/70"
              style={{ left: `${m.posicao * 100}%` }}
            >
              <span className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-slate-600" />
            </span>
          ))}
          {agora !== undefined && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l border-volt-950/70" style={{ left: `${agora * 100}%` }} />
          )}
          {dica && (
            <div
              role="tooltip"
              className={cn(
                "pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-md bg-volt-950 px-2.5 py-1.5 text-12 text-paper-0",
                lado < 0.15 ? "" : lado > 0.85 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${lado * 100}%` }}
            >
              <p className="font-semibold">{dica.rotuloLongo}</p>
              <p className="tabular-nums">
                {dica.futuro
                  ? "ainda não aconteceu"
                  : `${dica.valor.toLocaleString("pt-BR")} ${dica.valor === 1 ? unidade[0] : unidade[1]}${dica.atual ? " até agora" : ""}`}
              </p>
            </div>
          )}
        </div>
      </div>
      <ol aria-hidden="true" className="ml-9 mt-2 flex h-4 gap-[3px] text-12 text-slate-600">
        {barras.map((b, i) => (
          <li key={b.chave} className="relative min-w-0 flex-1">
            {mostraRotulo(i) && (
              <span className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap", b.atual && "font-semibold text-volt-950")}>
                {b.rotulo}
              </span>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}
