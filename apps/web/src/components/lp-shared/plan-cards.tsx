"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { PLANS, WHATSAPP_URL, type Plan } from "@/components/lp3/landing-data";
import { withWhatsAppText } from "@/components/lp-shared/lead-message";
import type { LpVariant } from "@/components/lp-shared/lp-data";
import { cn } from "@/lib/utils";

type Ciclo = "mensal" | "anual";

/** Maior desconto do anual entre os planos — sai de PLANS, não é digitado. */
const MAX_OFF = Math.max(...PLANS.map((p) => Math.round((1 - p.annualPrice / p.price) * 100)));

/**
 * No celular os cartões empilham com o recomendado primeiro; no desktop voltam
 * para a ordem de PLANS (Essencial, Growth, Operação) pelo `order` do grid.
 * O DOM segue a ordem do celular, que é onde chega o tráfego de anúncio.
 */
const ORDEM_CELULAR = [...PLANS].sort((a, b) => Number(b.featured) - Number(a.featured));
const ORDEM_DESKTOP = ["lg:order-1", "lg:order-2", "lg:order-3"] as const;

/** "Quero a Operação", "Quero o Growth". */
const ARTIGO: Record<string, "o" | "a"> = { Operação: "a" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-950";

interface EstiloPlanos {
  seletor: string;
  opcao: string;
  opcaoAtiva: string;
  grade: string;
  cartao: string;
  cartaoDestaque: string;
  selo: string;
  nome: string;
  quem: string;
  quemDestaque: string;
  /** `leading-*` DEPOIS do `text-[…]`: o tailwind-merge do `cn` descarta a entrelinha que vem antes do tamanho. */
  valor: string;
  porMes: string;
  linha: string;
  linhaDestaque: string;
  lista: string;
  listaDestaque: string;
  checkDestaque: string;
  cta: string;
  ctaLivre: string;
  ctaDestaque: string;
  /** Ícone do WhatsApp no botão do recomendado (cartaz e atacado, como nos mockups). */
  ctaComIcone: boolean;
  /** Linha compacta de Essencial e Operação no celular. */
  compacta: string;
  compactaNome: string;
  compactaResumo: string;
  compactaPreco: string;
  compactaMes: string;
}

/** Entre 1024 e 1279 px o cartão é estreito: fonte e margem menores pra "Quero o Essencial" caber numa linha. */
const PILULA =
  "mt-auto inline-flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-full border-2 px-5 text-center text-lg font-extrabold transition-colors lg:px-4 lg:text-base xl:px-7 xl:text-lg";
const PILULA_CLARA = "border-volt-950 bg-paper-0 text-volt-950 hover:bg-[#C4FF74]";
const SELETOR_OPCAO = "min-h-11 rounded-full px-2.5 lg:px-[18px]";

const ESTILO: Record<LpVariant, EstiloPlanos> = {
  cartaz: {
    seletor:
      "grid grid-cols-2 overflow-hidden rounded-[10px] border-[1.5px] border-volt-950 bg-paper-0 text-[15px] font-bold text-volt-950 lg:inline-flex lg:text-base",
    opcao: "min-h-11 px-2 hover:bg-[#F2FFE0] lg:px-5",
    opcaoAtiva: "bg-volt-950 text-paper-0 hover:bg-volt-950",
    grade: "gap-3.5 lg:gap-5",
    cartao: "gap-3.5 rounded-[14px] border-[1.5px] border-volt-950 bg-white p-[22px] text-volt-950 lg:gap-4 lg:p-[30px]",
    cartaoDestaque: "bg-acid-500",
    // Etiqueta kraft recortada em seta (.etq-volt do mockup); o furo é o ::before.
    selo:
      "-top-4 right-3.5 -rotate-3 bg-volt-950 py-[7px] pl-7 pr-3.5 text-[13px] font-bold text-paper-0 [clip-path:polygon(18px_0,100%_0,100%_100%,18px_100%,0_50%)] before:absolute before:left-[13px] before:top-1/2 before:-mt-[4.5px] before:size-[9px] before:rounded-full before:bg-paper-0 lg:-top-[18px] lg:right-[22px] lg:py-[9px] lg:pl-8 lg:pr-[18px] lg:text-[15px]",
    nome: "font-[family-name:var(--font-cartaz)] text-[38px] font-black leading-[.9] [font-stretch:68%] lg:text-[44px]",
    quem: "text-[15px] text-slate-600 lg:text-base",
    quemDestaque: "font-semibold text-volt-950",
    valor: "",
    porMes: "",
    linha: "text-[13px] text-slate-600 lg:text-sm",
    linhaDestaque: "font-semibold text-volt-950",
    lista: "text-[15px] leading-[1.4] lg:text-base",
    listaDestaque: "font-semibold",
    checkDestaque: "",
    cta: "mt-auto inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-[10px] px-4 text-center text-lg font-extrabold uppercase tracking-[.015em] [font-stretch:75%] transition-colors lg:min-h-[60px] xl:px-7 xl:text-[21px]",
    ctaLivre: "text-volt-950 shadow-[inset_0_0_0_2px_#071923] hover:bg-volt-950 hover:text-paper-0",
    ctaDestaque: "bg-volt-950 text-paper-0 hover:bg-volt-800",
    ctaComIcone: true,
    compacta: "rounded-[14px] border-[1.5px] border-volt-950 bg-white px-[18px] py-4 text-volt-950",
    compactaNome: "font-[family-name:var(--font-cartaz)] text-[26px] font-black leading-[.9] [font-stretch:68%]",
    compactaResumo: "mt-1 text-sm text-slate-600",
    compactaPreco: "font-[family-name:var(--font-cartaz)] text-[30px] font-black leading-none [font-stretch:68%]",
    compactaMes: "text-sm font-extrabold [font-stretch:80%]",
  },
  piloto: {
    seletor: "grid grid-cols-2 rounded-full bg-canvas-100 p-1 text-sm font-bold text-volt-950 lg:inline-flex lg:text-[15px]",
    opcao: SELETOR_OPCAO,
    opcaoAtiva: "bg-volt-950 text-paper-0",
    grade: "gap-3 lg:gap-5",
    cartao:
      "gap-3 rounded-[20px] border border-line-200 bg-white p-[22px] text-volt-950 shadow-[0_1px_2px_rgba(7,25,35,.06),0_12px_32px_rgba(7,25,35,.08)] lg:gap-4 lg:p-7",
    cartaoDestaque: "border-transparent bg-volt-950 text-paper-0",
    selo:
      "-top-[15px] left-5 rounded-full border-2 border-volt-950 bg-acid-500 px-4 py-2 text-xs font-black uppercase tracking-[.02em] text-volt-950 lg:-top-4 lg:left-7 lg:text-[13px]",
    nome: "text-[22px] font-extrabold lg:text-2xl",
    quem: "text-[15px] text-slate-600",
    quemDestaque: "text-[#C5CFCD]",
    valor: "font-extrabold tracking-[-.03em] text-[46px] lg:text-[52px] leading-[1.04]",
    porMes: "text-base font-bold",
    linha: "text-[13px] text-slate-600 lg:text-sm",
    linhaDestaque: "text-[#C5CFCD]",
    lista: "text-[15px] leading-[1.4]",
    listaDestaque: "",
    checkDestaque: "text-acid-500",
    cta: PILULA,
    ctaLivre: PILULA_CLARA,
    ctaDestaque: "border-acid-500 bg-acid-500 text-volt-950 hover:bg-[#C4FF74]",
    ctaComIcone: false,
    compacta:
      "rounded-[20px] border border-line-200 bg-white px-[18px] py-4 text-volt-950 shadow-[0_1px_2px_rgba(7,25,35,.06),0_12px_32px_rgba(7,25,35,.08)]",
    compactaNome: "text-lg font-extrabold",
    compactaResumo: "text-[13px] text-slate-600",
    compactaPreco: "text-2xl font-extrabold leading-[1.04] tracking-[-.03em]",
    compactaMes: "text-[13px]",
  },
  atacado: {
    seletor:
      "grid grid-cols-2 rounded-full border-2 border-volt-950 bg-white p-1 text-sm font-extrabold text-volt-950 lg:inline-flex lg:text-[15px]",
    opcao: SELETOR_OPCAO,
    opcaoAtiva: "bg-volt-950 text-paper-0",
    grade: "gap-3 lg:gap-[22px]",
    cartao: "gap-3 rounded-[22px] border-2 border-volt-950 bg-white p-5 text-volt-950 lg:gap-3.5 lg:rounded-3xl lg:p-[26px]",
    cartaoDestaque: "bg-acid-500 shadow-[0_6px_0_#071923] lg:shadow-[0_8px_0_#071923]",
    selo:
      "-top-4 right-4 rotate-3 rounded-full border-2 border-volt-950 bg-volt-950 px-4 py-2 text-xs font-black uppercase tracking-[.02em] text-paper-0 lg:-top-[18px] lg:right-[22px] lg:text-[13px]",
    nome: "font-[family-name:var(--font-spartan)] text-[26px] font-black leading-none tracking-[-.02em] lg:text-[28px]",
    quem: "text-[15px] font-medium text-slate-600",
    quemDestaque: "font-bold text-volt-950",
    valor:
      "font-[family-name:var(--font-spartan)] font-black tracking-[-.02em] text-[46px] lg:text-[52px] leading-none",
    porMes: "text-base font-extrabold",
    linha: "text-[13px] font-semibold text-slate-600 lg:text-sm",
    linhaDestaque: "font-bold text-volt-950",
    lista: "text-sm font-medium leading-[1.4] lg:text-[15px]",
    listaDestaque: "font-bold",
    checkDestaque: "",
    cta: PILULA,
    ctaLivre: PILULA_CLARA,
    ctaDestaque: "border-volt-950 bg-volt-950 text-paper-0 hover:bg-volt-800",
    ctaComIcone: true,
    compacta: "rounded-2xl border-2 border-volt-950 bg-white px-4 py-3.5 text-volt-950",
    compactaNome: "text-[17px] font-bold",
    compactaResumo: "text-xs font-semibold text-slate-600",
    compactaPreco: "font-[family-name:var(--font-spartan)] text-2xl font-black leading-none tracking-[-.02em]",
    compactaMes: "text-xs",
  },
};

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

/** Preço grande. O cartaz tem R$ e /mês pequenos no alto (cartaz de loja); os outros, "R$ 197" corrido. */
function Preco({ variant, valor, e }: { variant: LpVariant; valor: number; e: EstiloPlanos }) {
  if (variant === "cartaz") {
    return (
      <p className="flex items-start gap-[3px] font-[family-name:var(--font-cartaz)] text-[76px] font-black leading-[.9] tabular-nums [font-stretch:68%] lg:gap-1 lg:text-[92px]">
        <span className="mt-2 text-2xl lg:mt-2.5 lg:text-[30px]">R$</span>
        {valor}
        <span className="mt-2.5 text-lg font-extrabold [font-stretch:80%] lg:mt-3 lg:text-[22px]">/mês</span>
      </p>
    );
  }
  return (
    <p>
      <span className={cn("tabular-nums", e.valor)}>R$ {valor}</span>
      <span className={e.porMes}>/mês</span>
    </p>
  );
}

interface CartaoProps {
  plano: Plan;
  ciclo: Ciclo;
  variant: LpVariant;
}

function linkDoPlano(plano: Plan, ciclo: Ciclo): string {
  return withWhatsAppText(WHATSAPP_URL, `Olá! Quero saber do plano ${plano.name} (${ciclo}).`);
}

function Cartao({ plano, ciclo, variant }: CartaoProps) {
  const e = ESTILO[variant];
  const destaque = plano.featured;
  const anual = ciclo === "anual";
  const linha = cn(e.linha, destaque && e.linhaDestaque);

  return (
    <article
      className={cn(
        "relative flex flex-col",
        e.cartao,
        destaque && e.cartaoDestaque,
        // No celular, só o recomendado aparece inteiro; os outros viram LinhaCompacta.
        !destaque && "hidden lg:flex",
        ORDEM_DESKTOP[PLANS.indexOf(plano)],
      )}
    >
      {destaque && <span className={cn("absolute whitespace-nowrap", e.selo)}>O que a gente recomenda</span>}
      <h3 className={e.nome}>{plano.name}</h3>
      <p className={cn(e.quem, destaque && e.quemDestaque)}>{plano.who}</p>

      <div className="flex flex-col gap-1">
        {anual && (
          <p className={linha}>
            <s>R$ {plano.price} no mensal</s>
          </p>
        )}
        <Preco variant={variant} valor={anual ? plano.annualPrice : plano.price} e={e} />
        <p className={cn("tabular-nums", linha)}>
          {anual
            ? `R$ ${brl(plano.annualPrice * 12)} cobrados 1x ao ano`
            : `ou R$ ${plano.annualPrice}/mês no plano anual`}
        </p>
      </div>

      <ul className={cn("flex flex-col gap-2 lg:gap-2.5", e.lista, destaque && e.listaDestaque)}>
        {plano.features.map((item) => (
          <li key={item} className="flex gap-2 lg:gap-2.5">
            <Check
              aria-hidden
              className={cn("mt-0.5 size-[17px] shrink-0 lg:size-[18px]", destaque && e.checkDestaque)}
            />
            {item}
          </li>
        ))}
      </ul>

      <a
        href={linkDoPlano(plano, ciclo)}
        data-outbound="whatsapp_click"
        className={cn(e.cta, destaque ? e.ctaDestaque : e.ctaLivre, FOCO)}
      >
        {destaque && e.ctaComIcone && <WhatsAppIcon className="size-5 shrink-0 text-acid-500 lg:size-[22px]" />}
        Quero {ARTIGO[plano.name] ?? "o"} {plano.name}
      </a>
    </article>
  );
}

/**
 * Essencial e Operação no celular: uma linha com nome, resumo e preço, como nos
 * três mockups mobile. O recomendado fica inteiro em cima, e a seção não vira
 * três telas de rolagem. No desktop some, e os três cartões ficam lado a lado.
 */
function LinhaCompacta({ plano, ciclo, variant }: CartaoProps) {
  const e = ESTILO[variant];

  return (
    <a
      href={linkDoPlano(plano, ciclo)}
      data-outbound="whatsapp_click"
      className={cn("flex items-center justify-between gap-4 lg:hidden", e.compacta, FOCO)}
    >
      <span className="min-w-0">
        <span className={cn("block", e.compactaNome)}>{plano.name}</span>
        <span className={cn("block", e.compactaResumo)}>{plano.short}</span>
      </span>
      <span className={cn("shrink-0 whitespace-nowrap tabular-nums", e.compactaPreco)}>
        R$ {ciclo === "anual" ? plano.annualPrice : plano.price}
        <span className={e.compactaMes}>/mês</span>
      </span>
    </a>
  );
}

interface PlanCardsProps {
  variant: LpVariant;
  /** Título da seção, na mesma linha do seletor no desktop (a Cartaz+ usa). */
  header?: ReactNode;
  className?: string;
}

/**
 * Planos com seletor Mensal | Anual. O MENSAL abre marcado: R$ 197, 297 e 497
 * são os preços em destaque das landings; o anual aparece como opção, com a
 * conta do que é cobrado de uma vez. Todo número sai de PLANS.
 */
export function PlanCards({ variant, header, className }: PlanCardsProps) {
  const [ciclo, setCiclo] = useState<Ciclo>("mensal");
  const e = ESTILO[variant];

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-end lg:gap-12">
        {header && <div className="min-w-0 lg:flex-1">{header}</div>}
        <div
          role="group"
          aria-label="Forma de pagamento"
          className={cn("w-full lg:ml-auto lg:w-auto lg:shrink-0", e.seletor)}
        >
          {(["mensal", "anual"] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={ciclo === opcao}
              onClick={() => setCiclo(opcao)}
              className={cn("transition-colors", e.opcao, ciclo === opcao && e.opcaoAtiva, FOCO)}
            >
              {opcao === "mensal" ? "Mensal" : `Anual · até ${MAX_OFF}% off`}
            </button>
          ))}
        </div>
      </div>
      {/* pt: o selo do recomendado sobra 16–18 px acima do cartão. */}
      <div className={cn("grid pt-5 lg:grid-cols-3 lg:items-stretch", e.grade)}>
        {ORDEM_CELULAR.map((plano) => (
          <Fragment key={plano.name}>
            <Cartao plano={plano} ciclo={ciclo} variant={variant} />
            {!plano.featured && <LinhaCompacta plano={plano} ciclo={ciclo} variant={variant} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
