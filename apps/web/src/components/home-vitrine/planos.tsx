"use client";

import { useState, type ReactNode } from "react";
import { Check, Smartphone, Users } from "lucide-react";
import { SIGNUP_URL, type Plan } from "@/components/lp3/landing-data";
import { MAX_OFF } from "@/components/lp-shared/lp-data";
import { Alternador } from "@/components/home-shared/alternador";
import { FOCO_ESCURO } from "@/components/home-shared/estilo";
import { economiaAnual, plano, reais, type NomePlano } from "@/components/home-shared/home-data";
import { BOTAO, FOCO, H2, MIOLO, TOPO_CENTRO, TRILHO } from "@/components/home-vitrine/ui";
import { IMPLANTACAO_CENTS, MENSAL_CENTS } from "@/lib/billing/instagram-preco";
import { cn } from "@/lib/utils";

type Periodo = "mensal" | "anual";
type Estilo = "claro" | "recomendado" | "escuro";

interface Cartao {
  nome: NomePlano;
  estilo: Estilo;
  publico: string;
  celulares: string;
  grupos: string;
  destaques: readonly string[];
}

/* Recursos conferidos em PLANS (lp3/landing-data) em 15/10/2026; o do Growth
   usa as palavras de lá ("Agenda semanal em 1 clique"). */
const CARTOES: readonly Cartao[] = [
  {
    nome: "Essencial",
    estilo: "claro",
    publico: "Pra começar, com até 5 grupos.",
    celulares: "1 celular conectado",
    grupos: "Até 5 grupos",
    destaques: ["Texto, foto e vídeo em todos", "Agenda dia e hora", "Aviso por e-mail se desconectar", "Só posta em grupo"],
  },
  {
    nome: "Growth",
    estilo: "recomendado",
    publico: "Pra quem opera dezenas de grupos.",
    celulares: "2 celulares conectados",
    grupos: "Grupos sem limite",
    destaques: [
      "Tudo do Essencial",
      "Grupo lotou, o próximo nasce",
      "Página com a sua marca",
      "Contatos: quem entrou e quem saiu",
      "Agenda semanal em 1 clique",
      "Venda com a origem",
    ],
  },
  {
    nome: "Operação",
    estilo: "escuro",
    publico: "Pra quem quer a gente do lado no começo.",
    celulares: "2 celulares conectados",
    grupos: "Grupos sem limite",
    destaques: ["Tudo do Growth", "Montagem junto com a gente", "Revisão mensal 1:1", "Prioridade no suporte"],
  },
];

const PERIODOS = [
  { valor: "mensal", texto: "Mensal" },
  {
    valor: "anual",
    texto: (
      <>
        Anual
        <span className="rounded-full bg-acid-500 px-2 py-[3px] text-[11.5px] font-bold text-volt-950">até {MAX_OFF}% off</span>
      </>
    ),
  },
] as const satisfies ReadonlyArray<{ valor: Periodo; texto: ReactNode }>;

/** Linha de cima, preço do mês e, no anual, o total que o cartão paga de uma vez. */
function PrecoDoPlano({ p, anual, escuro }: { p: Plan; anual: boolean; escuro: boolean }) {
  const apoio = escuro ? "text-white/70" : "text-slate-600";
  return (
    <>
      <p className={cn("mt-4 text-[13.5px]", escuro ? "text-white/60" : "text-slate-600")}>
        {anual ? <s>De {reais(p.price)} por</s> : <>No anual, {reais(p.annualPrice)} por mês</>}
      </p>
      <p
        className={cn(
          "font-brand text-[42px] font-extrabold leading-[1.05] tracking-[-.03em]",
          escuro ? "text-acid-500" : "text-cobalt-500",
        )}
      >
        {reais(anual ? p.annualPrice : p.price)}
        <small className={cn("font-body text-[14.5px] font-semibold tracking-normal", apoio)}> por mês</small>
      </p>
      {anual && <p className={cn("mt-1 text-[13px]", apoio)}>Cobrança anual de {reais(p.annualPrice * 12)}</p>}
    </>
  );
}

/** Celulares e grupos em destaque, e a lista do que o plano tem. */
function RecursosDoPlano({ cartao, escuro, recomendado }: { cartao: Cartao; escuro: boolean; recomendado: boolean }) {
  const icone = cn("size-[17px] shrink-0", escuro ? "text-acid-500" : "text-cobalt-500");
  return (
    <>
      <ul
        className={cn(
          "mt-4 grid gap-2 rounded-xl px-3.5 py-3 text-sm font-semibold",
          escuro ? "bg-white/[.08]" : recomendado ? "bg-white" : "bg-[#F4F7F2]",
        )}
      >
        <li className="flex items-center gap-2.5">
          <Smartphone aria-hidden className={icone} />
          {cartao.celulares}
        </li>
        <li className="flex items-center gap-2.5">
          <Users aria-hidden className={icone} />
          {cartao.grupos}
        </li>
      </ul>
      <p className={cn("mt-[18px] text-[13px] font-bold", escuro ? "text-acid-500" : "text-cobalt-700")}>Em destaque</p>
      <ul className="mb-[22px] mt-2.5 grid gap-[9px] text-sm">
        {cartao.destaques.map((destaque) => (
          <li key={destaque} className="flex items-center gap-2.5">
            <Check aria-hidden strokeWidth={2.4} className={cn("size-4 shrink-0", escuro ? "text-acid-500" : "text-[#0C7346]")} />
            {destaque}
          </li>
        ))}
      </ul>
    </>
  );
}

function CartaoPlano({ cartao, periodo }: { cartao: Cartao; periodo: Periodo }) {
  const p = plano(cartao.nome);
  const anual = periodo === "anual";
  const escuro = cartao.estilo === "escuro";
  const recomendado = cartao.estilo === "recomendado";
  return (
    <article
      className={cn(
        "relative flex flex-col rounded-[22px] px-6 pb-6 pt-[26px]",
        escuro && "bg-volt-950 text-white",
        recomendado && "order-first border-2 border-cobalt-500 bg-[#EEF3FF] pt-[54px] lg:order-none",
        cartao.estilo === "claro" && "border border-[#E3EADF] bg-white",
      )}
    >
      {recomendado && (
        <p className="absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-t-[19px] bg-cobalt-500 text-[13px] font-bold text-white">
          O que a gente recomenda
        </p>
      )}
      <header className="flex items-center justify-between gap-2.5">
        <h3 className="font-brand text-[21px] font-bold">{cartao.nome}</h3>
        {anual && (
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-[9px] py-1 text-[11.5px] font-bold",
              escuro ? "bg-acid-500 text-volt-950" : "bg-volt-950 text-acid-500",
            )}
          >
            economiza {reais(economiaAnual(p))} por ano
          </span>
        )}
      </header>
      <PrecoDoPlano p={p} anual={anual} escuro={escuro} />
      <p className={cn("mt-1.5 text-sm", escuro ? "text-white/70" : "text-slate-600")}>{cartao.publico}</p>
      <RecursosDoPlano cartao={cartao} escuro={escuro} recomendado={recomendado} />
      {/* No cartão escuro o anel de foco é acid: o volt sumiria no fundo. */}
      <a
        href={SIGNUP_URL}
        className={cn(BOTAO, "mt-auto lg:w-full", escuro ? cn("bg-white hover:bg-white/90", FOCO_ESCURO) : FOCO)}
      >
        Quero o {cartao.nome}
      </a>
    </article>
  );
}

/** Os três planos com o seletor Mensal/Anual. Abre no anual, como no mockup aprovado. */
export function VitrinePlanos() {
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-4 py-[60px] lg:py-24">
      <div className={cn(MIOLO, TOPO_CENTRO)}>
        <h2 id="planos-titulo" className={H2}>
          Planos e preços pra sua loja
        </h2>
        <Alternador rotulo="Período" opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} className={TRILHO} />
      </div>
      <div className={cn(MIOLO, "mt-[26px] grid gap-[18px] lg:mt-10 lg:grid-cols-3 lg:gap-4")}>
        {CARTOES.map((cartao) => (
          <CartaoPlano key={cartao.nome} cartao={cartao} periodo={periodo} />
        ))}
      </div>
      <p className="mx-auto mt-[22px] max-w-[62em] px-[18px] text-center text-[13.5px] text-slate-600">
        {periodo === "anual" ? "Preço do plano anual, por mês, cobrado de uma vez no ano." : "Preço do plano mensal."} Teste 7
        dias grátis em qualquer plano. Instagram é complemento: {reais(MENSAL_CENTS / 100)} por mês, mais{" "}
        {reais(IMPLANTACAO_CENTS / 100)} de implantação. Pagamento no cartão; Pix ainda não.
      </p>
    </section>
  );
}
