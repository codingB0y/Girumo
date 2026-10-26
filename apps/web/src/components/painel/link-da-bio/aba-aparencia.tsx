// apps/web/src/components/painel/link-da-bio/aba-aparencia.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Play } from "lucide-react";

import { Interruptor } from "@/components/painel/instagram/interruptor";
import { MODELOS, PALETAS, type DadosRender, type DocumentoBio, type Modelo } from "@/lib/bio/documento";
import { dadosDaPrevia, NOME_DO_MODELO } from "@/lib/bio/editor";
import {
  amostraDaPaleta,
  comModelo,
  corDoSeletor,
  coresDaMarca,
  DESCRICAO_DO_MODELO,
  NOME_DA_PALETA,
  type CoresDaMarca,
} from "@/lib/bio/editor-aparencia";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { AvisoDaAba, useErroDaAba, type ErroDaAba } from "./erro-da-aba";
import { QuadroDaPrevia } from "./previa";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;
const CARTAO = "pn-card grid gap-4 rounded-xl p-4 lg:p-5";
const TITULO = "font-brand text-15 font-bold text-volt-950";

/** Os campos da aba que mostram erro do salvar; o resto vai pro aviso do topo. */
const LUGARES_DA_APARENCIA: readonly string[] = ["cores.fundo", "cores.botao"];

type IdDaPaleta = (typeof PALETAS)[Modelo][number];
type Miniatura = { modelo: Modelo; dados: DadosRender };

function Bolinhas({ fundo, botao }: { fundo: string; botao: string }) {
  return (
    <span aria-hidden="true" className="flex flex-none">
      <span className="h-7 w-7 rounded-full ring-1 ring-line-200" style={{ backgroundColor: fundo }} />
      <span className="-ml-2 h-7 w-7 rounded-full ring-2 ring-paper-0" style={{ backgroundColor: botao }} />
    </span>
  );
}

function BotaoDePaleta({
  ativa,
  fundo,
  botao,
  aoEscolher,
  children,
}: {
  ativa: boolean;
  fundo: string;
  botao: string;
  aoEscolher: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={aoEscolher}
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-full border bg-paper-0 py-1.5 pl-1.5 pr-4 text-15 font-semibold text-volt-950",
        FOCO,
        ativa ? "border-2 border-volt-950" : "border-line-200 hover:border-slate-600",
      )}
    >
      <Bolinhas fundo={fundo} botao={botao} />
      {children}
    </button>
  );
}

/** Seletor de cor + o código (#RRGGBB): o código digitado só vai pro documento quando forma uma cor. */
function CampoDeCor({
  id,
  rotulo,
  valor,
  erro,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: string;
  erro?: string;
  aoMudar: (cor: string) => void;
}) {
  const [texto, setTexto] = useState(valor);
  const [valorVisto, setValorVisto] = useState(valor);
  if (valor !== valorVisto) {
    setValorVisto(valor);
    setTexto(valor);
  }
  function mudar(entrada: string) {
    const cor = corDoSeletor(entrada);
    if (cor) aoMudar(cor);
  }
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={valor.toLowerCase()}
          aria-describedby={erro ? `${id}-erro` : undefined}
          onChange={(e) => mudar(e.target.value)}
          className={cn("h-11 w-14 flex-none cursor-pointer rounded-lg border border-line-200 bg-paper-0 p-1", FOCO)}
        />
        <input
          type="text"
          id={`${id}-hex`}
          aria-label={`${rotulo}, código da cor`}
          value={texto}
          maxLength={7}
          spellCheck={false}
          aria-invalid={corDoSeletor(texto) === null ? true : undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            mudar(e.target.value);
          }}
          onBlur={() => setTexto(valor)}
          className={cn(CAMPO, "w-32 font-data")}
        />
      </div>
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
    </div>
  );
}

function CartaoModelo({ atual, miniaturas, aoTrocar }: { atual: Modelo; miniaturas: readonly Miniatura[]; aoTrocar: (m: Modelo) => void }) {
  return (
    <section aria-labelledby="bio-modelo-titulo" className={CARTAO}>
      <h2 id="bio-modelo-titulo" className={TITULO}>
        Modelo
      </h2>
      <ul aria-labelledby="bio-modelo-titulo" className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        {miniaturas.map(({ modelo, dados }) => {
          const ativo = modelo === atual;
          return (
            <li
              key={modelo}
              className={cn(
                "relative grid content-start gap-2 rounded-xl border bg-paper-0 p-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt-500",
                ativo ? "border-2 border-volt-950" : "border-line-200 hover:border-slate-600",
              )}
            >
              {/* A página da loja neste modelo, a 30%: 390×653 vira 117×196 (mockup). */}
              <div className="mx-auto h-[196px] w-[117px] overflow-hidden rounded-lg bg-canvas-100">
                <QuadroDaPrevia miniatura dados={dados} rodada={0} className="h-[653px] w-[390px] origin-top-left scale-[0.3]" />
              </div>
              {/* O botão cobre o cartão inteiro (::after); o iframe fica fora dele (iframe não pode morar num botão). */}
              <button
                type="button"
                aria-pressed={ativo}
                aria-describedby={`bio-modelo-${modelo}-desc`}
                onClick={() => aoTrocar(modelo)}
                className="text-left text-15 font-semibold text-volt-950 outline-none after:absolute after:inset-0 after:rounded-xl"
              >
                {NOME_DO_MODELO[modelo]}
              </button>
              <p id={`bio-modelo-${modelo}-desc`} className="text-13 leading-snug text-slate-600">
                {DESCRICAO_DO_MODELO[modelo]}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CartaoCores({
  documento,
  mudarDocumento,
  erros,
}: {
  documento: DocumentoBio;
  mudarDocumento: PropsDaAba["mudarDocumento"];
  erros: ErroDaAba;
}) {
  const paletas: readonly IdDaPaleta[] = PALETAS[documento.modelo];
  const marca = coresDaMarca(documento);
  function mudarMarca(mudanca: Partial<CoresDaMarca>) {
    mudarDocumento((d) => ({ ...d, paleta: "marca", cores: { ...coresDaMarca(d), ...mudanca } }));
  }
  return (
    <section aria-labelledby="bio-cores-titulo" className={CARTAO}>
      <div className="grid gap-0.5">
        <h2 id="bio-cores-titulo" className={TITULO}>
          Cores
        </h2>
        <p className={AJUDA}>As quatro do modelo, ou as cores da sua marca.</p>
      </div>
      <div role="group" aria-labelledby="bio-cores-titulo" className="flex flex-wrap gap-2">
        {paletas.map((p) => {
          const [fundo, botao] = amostraDaPaleta(documento.modelo, p);
          // Paleta pronta não apaga `cores`: voltar pra "Cores da sua marca" recupera as duas.
          return (
            <BotaoDePaleta key={p} ativa={documento.paleta === p} fundo={fundo} botao={botao} aoEscolher={() => mudarDocumento((d) => ({ ...d, paleta: p }))}>
              {NOME_DA_PALETA[p]}
            </BotaoDePaleta>
          );
        })}
        <BotaoDePaleta ativa={documento.paleta === "marca"} fundo={marca.fundo} botao={marca.botao} aoEscolher={() => mudarMarca({})}>
          Cores da sua marca
        </BotaoDePaleta>
      </div>
      {documento.paleta === "marca" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoDeCor
            id="bio-cores-fundo"
            rotulo="Fundo da página"
            valor={marca.fundo}
            erro={erros.erroDe("cores.fundo")}
            aoMudar={(fundo) => {
              erros.corrigiu("cores.fundo");
              mudarMarca({ fundo });
            }}
          />
          <CampoDeCor
            id="bio-cores-botao"
            rotulo="Botão em destaque"
            valor={marca.botao}
            erro={erros.erroDe("cores.botao")}
            aoMudar={(botao) => {
              erros.corrigiu("cores.botao");
              mudarMarca({ botao });
            }}
          />
          <p className={cn(AJUDA, "sm:col-span-2")}>
            A página acerta o tom do texto e dos ícones pra continuarem legíveis em cima das suas cores.
          </p>
        </div>
      )}
    </section>
  );
}

/** Aba Aparência (spec §8): o modelo pelas miniaturas vivas, a paleta ou as cores da marca e a animação. */
export function AbaAparencia({ pagina, rascunho, contexto, mudarDocumento, reverAnimacao, erro, limparErro }: PropsDaAba) {
  const documento = rascunho.documento;
  const erros = useErroDaAba(erro, limparErro, LUGARES_DA_APARENCIA, pagina.versao);
  // Cada miniatura: a página da loja naquele modelo, com a paleta que o toque daria (`comModelo`).
  const miniaturas = useMemo(
    () => MODELOS.map((modelo) => ({ modelo, dados: dadosDaPrevia(pagina, comModelo(documento, modelo), contexto) })),
    [pagina, documento, contexto],
  );

  function trocarModelo(modelo: Modelo) {
    if (modelo === documento.modelo) return;
    // Os dois no mesmo handler: o React junta num só render, então a rodada sobe junto com o
    // documento novo e a prévia toca a entrada JÁ no modelo novo (§8), sem esperar os 300 ms.
    mudarDocumento((d) => comModelo(d, modelo));
    reverAnimacao();
  }

  return (
    <div className="grid gap-4">
      {erros.erroSolto && <AvisoDaAba mensagem={erros.erroSolto} />}
      <CartaoModelo atual={documento.modelo} miniaturas={miniaturas} aoTrocar={trocarModelo} />
      <CartaoCores documento={documento} mudarDocumento={mudarDocumento} erros={erros} />
      <section aria-labelledby="bio-animacao-titulo" className={CARTAO}>
        <div className="flex items-center gap-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 id="bio-animacao-titulo" className={TITULO}>
              Animação de entrada
            </h2>
            <p className={AJUDA}>
              Os botões entram um a um quando a página abre. Quem pediu menos movimento no celular vê a página parada.
            </p>
          </div>
          <Interruptor
            ligado={documento.animar}
            aoMudar={(animar) => mudarDocumento((d) => ({ ...d, animar }))}
            rotulo="Animação de entrada"
          />
        </div>
        <button type="button" onClick={reverAnimacao} disabled={!documento.animar} className={cn(SECUNDARIO, "w-fit")}>
          <Play className="h-4 w-4" aria-hidden="true" />
          Rever a animação
        </button>
      </section>
    </div>
  );
}
