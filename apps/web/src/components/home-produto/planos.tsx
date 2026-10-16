"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { MAX_OFF } from "@/components/lp-shared/lp-data";
import { Alternador } from "@/components/home-shared/alternador";
import { plano, reais, type NomePlano } from "@/components/home-shared/home-data";
import { BOTAO, BotaoTeste, FOCO, H2, MIOLO } from "@/components/home-produto/ui";
import { IMPLANTACAO_CENTS, MENSAL_CENTS } from "@/lib/billing/instagram-preco";
import { cn } from "@/lib/utils";

type Periodo = "mensal" | "anual";
type Celula = string | boolean;

/* Linhas da tabela, na ordem; os valores de cada coluna seguem a mesma ordem.
   Conferido em PLANS (lp3/landing-data) em 15/10/2026. */
const RECURSOS = ["Celulares", "Grupos", "Grupo novo sozinho", "Página com a sua marca", "Venda com a origem", "Montagem junto"] as const;
const DETALHES = ["Contatos: quem entrou e quem saiu", "Agenda semanal em 1 clique", "Revisão mensal 1:1", "Prioridade no suporte"] as const;

interface Coluna {
  nome: NomePlano;
  recomendado?: true;
  recursos: readonly Celula[];
  detalhes: readonly Celula[];
}

const COLUNAS: readonly Coluna[] = [
  { nome: "Essencial", recursos: ["1", "até 5", false, false, false, false], detalhes: [false, false, false, false] },
  { nome: "Growth", recomendado: true, recursos: ["2", "sem limite", true, true, true, false], detalhes: [true, true, false, false] },
  { nome: "Operação", recursos: ["2", "sem limite", true, true, true, true], detalhes: [true, true, true, true] },
];

const PERIODOS = [
  { valor: "mensal", texto: "Mensal" },
  { valor: "anual", texto: `Anual · até ${MAX_OFF}% menos` },
] as const;

function Valor({ valor }: { valor: Celula }) {
  if (typeof valor === "string") return <>{valor}</>;
  return valor ? (
    <>
      <Check aria-hidden strokeWidth={2.4} className="inline-block size-[18px] text-[#0C7346]" />
      <span className="sr-only">Incluso</span>
    </>
  ) : (
    <>
      <span aria-hidden className="text-[#84929A]">
        –
      </span>
      <span className="sr-only">Não incluso</span>
    </>
  );
}

const LINHA = "flex items-center justify-between gap-3 border-b border-[#EEF1F3] py-[11px] text-[14.5px] last:border-b-0";

/** As linhas de preço: o período escolhido sobe pra primeira, em destaque; o total do anual fecha. */
function PrecosDaColuna({ nome, periodo }: { nome: NomePlano; periodo: Periodo }) {
  const p = plano(nome);
  const precos = [
    { rotulo: "Por mês, no anual", valor: p.annualPrice },
    { rotulo: "No mensal", valor: p.price },
  ];
  const ordenados = periodo === "anual" ? precos : [...precos].reverse();
  return (
    <>
      {[...ordenados, { rotulo: "Cobrança anual", valor: p.annualPrice * 12 }].map((preco, i) => (
        <div key={preco.rotulo} className={LINHA}>
          <dt className="text-slate-600">{preco.rotulo}</dt>
          <dd className={cn("text-right font-semibold", i === 0 && "font-brand text-[22px] font-bold text-cobalt-500")}>
            {reais(preco.valor)}
          </dd>
        </div>
      ))}
    </>
  );
}

function ColunaPlano({ coluna, periodo, detalhes }: { coluna: Coluna; periodo: Periodo; detalhes: boolean }) {
  const linhas: ReadonlyArray<readonly [string, Celula]> = [
    ...RECURSOS.map((r, i) => [r, coluna.recursos[i]] as const),
    ...(detalhes ? DETALHES.map((d, i) => [d, coluna.detalhes[i]] as const) : []),
  ];
  return (
    <div
      className={cn(
        "relative rounded-[18px] bg-white px-[22px] pb-2 pt-[22px]",
        coluna.recomendado ? "order-first border-2 border-cobalt-500 lg:order-none" : "border border-[#E2E7EA]",
      )}
    >
      {coluna.recomendado && (
        <p className="absolute -top-[13px] left-[22px] flex h-[26px] items-center rounded-full bg-cobalt-500 px-3 text-xs font-bold text-white">
          O que a gente recomenda
        </p>
      )}
      <h3 className="border-b border-[#E2E7EA] pb-3.5">
        <small className="block text-[12.5px] font-normal text-slate-600">Plano</small>
        <span className="mt-0.5 block font-brand text-xl font-bold">{coluna.nome}</span>
      </h3>
      <dl>
        <PrecosDaColuna nome={coluna.nome} periodo={periodo} />
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className={LINHA}>
            <dt className="text-slate-600">{rotulo}</dt>
            <dd className="text-right font-semibold">
              <Valor valor={valor} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Quanto custa, sem letra miúda" (ref. tabela de taxas da InfinitePay). Abre no anual. */
export function ProdutoPlanos() {
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  const [detalhes, setDetalhes] = useState(false);
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-4 py-[60px] lg:py-[100px]">
      <div className={MIOLO}>
        <h2 id="planos-titulo" className={cn(H2, "text-center")}>
          Quanto custa, sem letra miúda
        </h2>
        <Alternador rotulo="Período" opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} className="mx-auto mt-7 bg-[#EEF1F4]" />
        <p className="mt-3.5 text-center text-[14.5px] text-slate-600">
          Teste 7 dias grátis em qualquer plano. Você cadastra o cartão e a cobrança só começa no 8º dia.
        </p>
        <div className="mx-auto mt-9 grid max-w-[1080px] gap-[22px] lg:grid-cols-3 lg:gap-4">
          {COLUNAS.map((coluna) => (
            <ColunaPlano key={coluna.nome} coluna={coluna} periodo={periodo} detalhes={detalhes} />
          ))}
        </div>
        <div className="mt-8 flex flex-col items-stretch gap-3 lg:flex-row lg:justify-center">
          <BotaoTeste />
          <button
            type="button"
            aria-expanded={detalhes}
            onClick={() => setDetalhes((aberto) => !aberto)}
            className={cn(BOTAO, "bg-[#E7EBEE] hover:bg-[#DCE2E6]", FOCO)}
          >
            {detalhes ? "Ver menos detalhes" : "Ver todos os detalhes"}
          </button>
        </div>
        <p className="mx-auto mt-4 max-w-[60em] text-center text-[13.5px] text-slate-600">
          {periodo === "anual" && "No anual, o valor por mês é cobrado de uma vez no ano. "}
          Instagram (comentário e story viram link no direct) é complemento: {reais(MENSAL_CENTS / 100)} por mês, mais{" "}
          {reais(IMPLANTACAO_CENTS / 100)} de implantação. Pagamento no cartão; Pix ainda não. Cancela em Configurações, sem
          multa.
        </p>
      </div>
    </section>
  );
}
