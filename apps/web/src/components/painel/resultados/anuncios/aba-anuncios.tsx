// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React from "react";

import Link from "next/link";
import type { ReactNode } from "react";

import { SecoesDoResultados } from "@/components/painel/resultados/secoes-do-resultados";
import type { Carga } from "@/lib/painel/types";
import {
  avisoDePeriodoRecente,
  contagem,
  descricaoDoPeriodo,
  dinheiro,
  faixaDoTotal,
  HREF_INTEGRACAO_DO_SITE,
  HREF_NOVA_PAGINA,
  inteiro,
  porOnde,
  ROTULO_DO_ATALHO,
  type CartaoDeOrigem,
  type InicioDeGasto,
} from "@/lib/resultados/anuncios-tela";
import { ATALHOS, type AtalhoDoPeriodo } from "@/lib/resultados/periodo-anuncios";
import type { RelatorioParaTela, RespostaAnuncios } from "@/lib/resultados/relatorio-anuncios";
import { cn } from "@/lib/utils";
import { ComoContamos } from "./como-contamos";
import { FunilGrande } from "./funil-grande";
import { GraficoPorDia } from "./grafico-por-dia";

export type PropsDaAbaAnuncios = {
  atalho: AtalhoDoPeriodo;
  onAtalho: (atalho: AtalhoDoPeriodo) => void;
  carga: Carga;
  resposta: RespostaAnuncios | null;
  /** `YYYY-MM-DD` de Brasília: quem chama passa, para a tela não ler o relógio. */
  hoje: string;
  aoTentarDeNovo: () => void;
  /** Começos de lançamento de gasto (PR 7): viram anotação no gráfico por dia. */
  iniciosDeGasto?: readonly InicioDeGasto[];
  /** Botões antes de "Integração do site" no cabeçalho (PR 7: "Lançar gasto"). */
  acoesDoCabecalho?: ReactNode;
  /** Troca o rodapé do cartão "Gasto lançado" (PR 7: "3 lançamentos · lançar"). */
  rodapeDoGasto?: ReactNode;
};

const CARTAO = "rounded-xl border border-line-200 bg-paper-0";
const BOTAO =
  "inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * Resultados › Anúncios (spec 2026-10-10-funil-anuncios §4). Só desenha: a página
 * busca `GET /api/resultados/anuncios` e passa a carga. Erro nunca vira zero (padrão
 * `carga` da Vitrine); loja sem nenhum cadastro vê a tela Vazio, não um funil zerado.
 */
export function AbaAnuncios({
  atalho,
  onAtalho,
  carga,
  resposta,
  hoje,
  aoTentarDeNovo,
  iniciosDeGasto = [],
  acoesDoCabecalho,
  rodapeDoGasto,
}: PropsDaAbaAnuncios) {
  const vazio = carga === "ok" && resposta !== null && !resposta.tem_cadastro;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Resultados</h1>
          <p className="mt-1 text-15 text-slate-600">Qual anúncio trouxe quem comprou, pelo telefone do cadastro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {acoesDoCabecalho}
          <Link href={HREF_INTEGRACAO_DO_SITE} className={BOTAO}>
            Integração do site
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-200">
        <SecoesDoResultados atual="anuncios" />
        {!vazio && <SeletorDePeriodo atalho={atalho} onAtalho={onAtalho} />}
      </div>

      {carga === "erro" ? (
        <Erro aoTentarDeNovo={aoTentarDeNovo} />
      ) : carga === "carregando" || resposta === null ? (
        <Esqueleto />
      ) : !resposta.tem_cadastro ? (
        <Vazio />
      ) : (
        <Relatorio
          relatorio={resposta.relatorio}
          atalho={atalho}
          hoje={hoje}
          iniciosDeGasto={iniciosDeGasto}
          rodapeDoGasto={rodapeDoGasto}
        />
      )}
    </div>
  );
}

function SeletorDePeriodo({ atalho, onAtalho }: { atalho: AtalhoDoPeriodo; onAtalho: (a: AtalhoDoPeriodo) => void }) {
  return (
    <div role="group" aria-label="Período" className="mb-2 flex rounded-lg bg-canvas-100 p-0.5">
      {ATALHOS.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={atalho === a}
          onClick={() => onAtalho(a)}
          className={cn(
            "min-h-8 rounded-md px-3 text-13 font-semibold transition-colors",
            atalho === a ? "bg-paper-0 text-volt-950" : "text-slate-600 hover:text-volt-950",
          )}
        >
          {ROTULO_DO_ATALHO[a]}
        </button>
      ))}
    </div>
  );
}

function Relatorio({
  relatorio,
  atalho,
  hoje,
  iniciosDeGasto,
  rodapeDoGasto,
}: {
  relatorio: RelatorioParaTela;
  atalho: AtalhoDoPeriodo;
  hoje: string;
  iniciosDeGasto: readonly InicioDeGasto[];
  rodapeDoGasto?: ReactNode;
}) {
  const aviso = avisoDePeriodoRecente(relatorio.periodo.ate, hoje);
  const origens = porOnde(relatorio.por_origem);

  return (
    <>
      {aviso && (
        <p className="pn-aviso rounded-lg" role="status">
          {aviso}
        </p>
      )}
      <Faixa total={relatorio.total} rodapeDoGasto={rodapeDoGasto} />
      <FunilGrande total={relatorio.total} descricaoDoPeriodo={descricaoDoPeriodo(atalho)} />
      <section aria-labelledby="dia-titulo" className={cn(CARTAO, "px-4 py-5 md:px-6")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dia-titulo" className="font-brand text-20 font-bold text-volt-950">
            Cadastros e entradas por dia
          </h2>
          <span className="flex gap-3.5 text-13 text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-cobalt-500/30" />
              Cadastros
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-cobalt-500" />
              Entraram
            </span>
          </span>
        </div>
        <GraficoPorDia porDia={relatorio.por_dia} inicios={iniciosDeGasto} />
        {origens.length > 0 && <PorOnde origens={origens} />}
      </section>
      <Fora fora={relatorio.fora} />
      <ComoContamos />
    </>
  );
}

/** Os três números do topo. No celular a faixa rola de lado (spec §4, mockup Celular). */
function Faixa({ total, rodapeDoGasto }: { total: RelatorioParaTela["total"]; rodapeDoGasto?: ReactNode }) {
  return (
    <section
      aria-label="Números do período"
      // Rola no celular: precisa receber foco para quem navega por teclado.
      tabIndex={0}
      className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 focus-visible:outline-2 focus-visible:outline-cobalt-500 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0"
    >
      {faixaDoTotal(total).map((c) => (
        <div key={c.chave} className={cn(CARTAO, "min-w-[220px] shrink-0 snap-start px-[18px] py-4 md:min-w-0")}>
          <p className="text-13 text-slate-600">{c.rotulo}</p>
          <p
            className={cn(
              "font-brand mt-1.5 text-32 font-bold tabular-nums tracking-[-0.5px]",
              c.sucesso ? "text-success-700" : "text-volt-950",
            )}
          >
            {c.valor}
          </p>
          <p className="mt-0.5 text-13 text-slate-600">
            {c.chave === "gasto" && rodapeDoGasto ? rodapeDoGasto : c.detalhe}
          </p>
        </div>
      ))}
    </section>
  );
}

function PorOnde({ origens }: { origens: readonly CartaoDeOrigem[] }) {
  return (
    <ul aria-label="Por onde chegaram" className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {origens.map((o) => (
        <li key={o.nome} className="rounded-lg bg-canvas-100 px-3 py-2.5">
          <p className="text-13 text-slate-600">{o.nome}</p>
          <p className="font-brand mt-0.5 text-20 font-bold tabular-nums text-volt-950">
            {inteiro(o.cadastros)} <span className="text-13 font-medium text-slate-600">· {dinheiro(o.vendido)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function Fora({ fora }: { fora: RelatorioParaTela["fora"] }) {
  return (
    <section aria-labelledby="fora-titulo" className={cn(CARTAO, "px-4 py-5 md:px-6")}>
      <h2 id="fora-titulo" className="font-brand text-20 font-bold text-volt-950">
        No mesmo período, fora dos anúncios
      </h2>
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-canvas-100 px-4 py-3.5">
          <p className="text-13 text-slate-600">Entraram sem cadastro antes</p>
          <p className="font-brand my-1 text-28 font-bold tabular-nums text-volt-950">
            {inteiro(fora.entradas_sem_cadastro)}
          </p>
          <p className="text-13 text-slate-600">Convite repassado, link direto ou contato sem telefone.</p>
        </div>
        <div className="rounded-lg bg-canvas-100 px-4 py-3.5">
          <p className="text-13 text-slate-600">Vendas sem origem</p>
          <p className="font-brand my-1 text-28 font-bold tabular-nums text-volt-950">
            {dinheiro(fora.vendido_sem_origem)}{" "}
            <span className="text-15 font-medium text-slate-600">
              · {contagem(fora.pedidos_sem_origem, "pedido", "pedidos")}
            </span>
          </p>
          <p className="text-13 text-slate-600">Quem comprou sem ter se cadastrado nos 90 dias antes.</p>
        </div>
      </div>
      <p className="mt-3.5 text-13 text-slate-600">
        Aqui conta a data da entrada ou do pedido. O funil acima conta a data do cadastro, então os dois não somam
        com a Visão geral.
      </p>
    </section>
  );
}

function Erro({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <div className={cn(CARTAO, "p-6")} role="alert">
      <p className="text-15 text-volt-950">Não deu para carregar o funil dos anúncios.</p>
      <p className="mt-1 text-13 text-slate-600">Seus cadastros e vendas continuam registrados.</p>
      <button type="button" onClick={aoTentarDeNovo} className={cn(BOTAO, "mt-3")}>
        Tentar de novo
      </button>
    </div>
  );
}

function Esqueleto() {
  return (
    <div role="status" aria-label="Carregando o funil dos anúncios" className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pn-skeleton h-28 rounded-xl" />
        ))}
      </div>
      <div className="pn-skeleton h-80 rounded-xl" />
    </div>
  );
}

function OpcaoDoVazio({ href, titulo, texto, acao }: { href: string; titulo: string; texto: string; acao: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-line-200 bg-paper-0 p-4 transition-colors hover:border-cobalt-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
    >
      <span className="text-15 font-semibold text-volt-950">{titulo}</span>
      <span className="text-13 text-slate-600">{texto}</span>
      <span className="mt-1 text-13 font-semibold text-cobalt-500">{acao} →</span>
    </Link>
  );
}

/** Loja que nunca recebeu cadastro com origem (spec §4 "Vazio", mockup Vazio). */
function Vazio() {
  return (
    <section aria-labelledby="vazio-titulo" className={cn(CARTAO, "grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]")}>
      <div>
        <h2 id="vazio-titulo" className="font-brand text-20 font-bold text-volt-950">
          Ainda não chegou nenhum cadastro com origem
        </h2>
        <p className="mt-2 text-15 text-slate-600">
          Pra saber qual anúncio traz gente pro grupo e qual traz venda, a Girumo precisa do telefone de quem se
          cadastrou e dos parâmetros do anúncio. Escolha por onde eles chegam:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-15 text-volt-950">
          <li>Cadastro passa pela Girumo: seu site ou uma página nossa.</li>
          <li>Os anúncios levam os parâmetros de URL.</li>
          <li>Venda lançada no contato, como já é hoje.</li>
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        <OpcaoDoVazio
          href={HREF_INTEGRACAO_DO_SITE}
          titulo="Tenho site próprio"
          texto="O site manda o cadastro pra Girumo e recebe o link do grupo. Pede uma mudança pequena no site."
          acao="Conectar o site"
        />
        <OpcaoDoVazio
          href={HREF_NOVA_PAGINA}
          titulo="Usar uma página da Girumo"
          texto="Já vem com cadastro e origem. Não precisa programar nada."
          acao="Criar página"
        />
      </div>
    </section>
  );
}
