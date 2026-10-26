// apps/web/src/components/painel/link-da-bio/previa.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Eye, Play } from "lucide-react";

import { Folha } from "@/components/painel/folha";
import type { DadosRender, DocumentoBio } from "@/lib/bio/documento";
import { NOME_DO_MODELO } from "@/lib/bio/editor";
import { renderPaginaBio } from "@/lib/bio/render";
import { cn } from "@/lib/utils";

export type PropsDaPrevia = { dados: DadosRender; rodada: number; aoReverAnimacao: () => void };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;

/** Quanto a prévia espera a última mudança antes de redesenhar: digitar não recarrega o iframe a cada letra. */
const ESPERA_DA_PREVIA_MS = 300;

/**
 * A página no iframe, com o MESMO renderizador da rota pública em modo "previa" (spec §8: sem
 * `<script>`, `<a>` sem href). `sandbox=""`: nada roda e nada navega. O `srcDoc` herda a CSP do
 * painel; funciona porque o modo prévia não tem script e as fontes são `'self'` na origem do painel.
 *
 * A entrada só toca quando `rodada` muda (link novo, troca de modelo, "Rever a animação"); qualquer
 * outra mudança redesenha parado.
 * Essas mudanças esperam 300 ms paradas (o CropFocal e o seletor de cor mandam uma por movimento).
 * `key={rodada}`: duas rodadas com o mesmo HTML ainda recarregam.
 */
export function QuadroDaPrevia({
  dados,
  rodada,
  className,
  miniatura = false,
}: {
  dados: DadosRender;
  rodada: number;
  className?: string;
  /** Miniatura de modelo (aba Aparência): fora do Tab, do mouse e do leitor de tela. */
  miniatura?: boolean;
}) {
  // Guarda o documento da última rodada: é com ele, e só com ele, que a entrada toca
  // (padrão do React de guardar a prop anterior no estado).
  const [rodadaVista, setRodadaVista] = useState(rodada);
  const [documentoDaRodada, setDocumentoDaRodada] = useState<DocumentoBio | null>(null);
  // O que o iframe mostra: os `dados` da última mudança depois de 300 ms parados.
  const [mostrados, setMostrados] = useState(dados);
  if (rodada !== rodadaVista) {
    setRodadaVista(rodada);
    setDocumentoDaRodada(dados.documento);
    setMostrados(dados); // a rodada passa na hora: é ela que toca a entrada
  }
  useEffect(() => {
    if (mostrados === dados) return;
    const espera = setTimeout(() => setMostrados(dados), ESPERA_DA_PREVIA_MS);
    return () => clearTimeout(espera);
  }, [dados, mostrados]);
  const animarEntrada = mostrados.documento.animar && mostrados.documento === documentoDaRodada;
  const html = useMemo(
    () => renderPaginaBio(mostrados, { modo: "previa", nonce: null, animarEntrada }),
    [mostrados, animarEntrada],
  );
  return (
    <iframe
      key={rodada}
      title="Prévia da página"
      srcDoc={html}
      sandbox=""
      tabIndex={-1}
      inert={miniatura}
      aria-hidden={miniatura || undefined}
      className={cn("block border-0 bg-paper-0", className)}
    />
  );
}

function ReverAnimacao({ animar, aoReverAnimacao }: { animar: boolean; aoReverAnimacao: () => void }) {
  return (
    <button type="button" onClick={aoReverAnimacao} disabled={!animar} className={SECUNDARIO}>
      <Play className="h-4 w-4" aria-hidden="true" />
      Rever a animação
    </button>
  );
}

/**
 * Computador (≥ 1024 px): coluna fixa à direita (§8). O celular de 390 px é desenhado a 340 px:
 * iframe 390×803 escalado por `transform` (340/390 ≈ 0,8718) dentro da moldura 340×700.
 */
export function PreviaNaColuna({ dados, rodada, aoReverAnimacao }: PropsDaPrevia) {
  return (
    <aside aria-label="Prévia da página" className="hidden lg:block lg:[@media(min-height:56rem)]:sticky lg:[@media(min-height:56rem)]:top-[72px]">
      <div className="pn-card grid justify-items-center gap-3 rounded-xl p-3.5">
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-15 font-semibold text-volt-950">Prévia</span>
          <span className="pn-chip">{`Modelo ${NOME_DO_MODELO[dados.documento.modelo]}`}</span>
        </div>
        <div className="h-[700px] w-[340px] overflow-hidden rounded-xl bg-paper-0 shadow-[0_18px_40px_-26px_rgb(7_25_35/0.45)] ring-1 ring-line-200">
          <QuadroDaPrevia dados={dados} rodada={rodada} className="h-[803px] w-[390px] origin-top-left scale-[0.8718]" />
        </div>
        <ReverAnimacao animar={dados.documento.animar} aoReverAnimacao={aoReverAnimacao} />
      </div>
    </aside>
  );
}

/**
 * Celular: "Ver como fica" (acima da barra de baixo e, com alteração, acima da barra de salvar —
 * `.pn-bio-ver` em painel-vitrine.css) abre a prévia em tela cheia. Abrir não toca a entrada.
 */
export function PreviaNoCelular({ dados, rodada, aoReverAnimacao }: PropsDaPrevia) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAberta(true)}
        className={`pn-bio-ver fixed right-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-volt-950 px-[18px] text-15 font-semibold text-paper-0 shadow-[0_10px_24px_-10px_rgb(7_25_35/0.6)] lg:hidden ${FOCO}`}
      >
        <Eye className="h-5 w-5" aria-hidden="true" />
        Ver como fica
      </button>
      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo="Prévia da página" testId="bio-previa-tela-cheia" telaCheia>
        <div className="flex items-center justify-between gap-2 border-b border-line-200 px-4 py-2">
          <span className="pn-chip">{`Modelo ${NOME_DO_MODELO[dados.documento.modelo]}`}</span>
          <ReverAnimacao animar={dados.documento.animar} aoReverAnimacao={aoReverAnimacao} />
        </div>
        <QuadroDaPrevia dados={dados} rodada={rodada} className="min-h-0 w-full flex-1" />
      </Folha>
    </>
  );
}
