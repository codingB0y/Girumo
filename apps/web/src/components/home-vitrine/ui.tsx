import { ArrowRight } from "lucide-react";
import { SIGNUP_URL } from "@/components/lp3/landing-data";
import { CTA_TESTE } from "@/components/home-shared/home-data";
import { FOCO } from "@/components/home-shared/estilo";
import { cn } from "@/lib/utils";

export { FOCO };

/** Miolo de 1440 com 64 px de margem no desktop e 18 px no celular (`.k4-w`). */
export const MIOLO = "mx-auto w-full max-w-[1440px] px-[18px] lg:px-16";

/** Título de seção (`.k4-h2`). */
export const H2 = "font-brand text-[28px] font-semibold leading-[1.16] tracking-[-.024em] text-balance lg:text-[38px]";

/** Título à esquerda e texto + botão à direita (`.k4-w.top`). */
export const TOPO = "grid gap-3.5 lg:grid-cols-2 lg:items-end lg:gap-[60px]";

/** Mesmo par, centrado na altura: título e um controle ao lado. */
export const TOPO_CENTRO = "grid gap-3.5 lg:grid-cols-2 lg:items-center lg:gap-[60px]";

/** Parágrafo do lado direito do TOPO. */
export const APOIO = "mb-3.5 max-w-[34em] text-[16.5px] leading-relaxed text-[#33474F] lg:mb-[18px]";

/** Faixa clara das seções alternadas. */
export const TINTA = "bg-[#F4FAEA]";

/** Trilho do seletor Mensal/Anual (`.k4-tog`): branco com borda, à direita no desktop. */
export const TRILHO = "justify-self-start border border-[#E3EADF] bg-white lg:justify-self-end";

/** Pílula acid (`.k4-btn`). Largura total no celular. */
export const BOTAO =
  "inline-flex h-[50px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-acid-500 px-6 text-[15.5px] font-bold text-volt-950 transition-colors hover:bg-[#B8FF5C] lg:w-auto";

/** "Testar 7 dias grátis" — o botão que se repete pela página e leva ao cadastro. */
export function BotaoTeste({ className }: { className?: string }) {
  return (
    <a href={SIGNUP_URL} className={cn(BOTAO, FOCO, className)}>
      {CTA_TESTE}
      <ArrowRight aria-hidden className="size-[18px] shrink-0" />
    </a>
  );
}
