import { ArrowRight } from "lucide-react";
import { SIGNUP_URL } from "@/components/lp3/landing-data";
import { CTA_TESTE } from "@/components/home-shared/home-data";
import { FOCO } from "@/components/home-shared/estilo";
import { cn } from "@/lib/utils";

export { FOCO };

/** Miolo de 1440 com 64 px de margem no desktop e 18 px no celular (`.k3-w`). */
export const MIOLO = "mx-auto w-full max-w-[1440px] px-[18px] lg:px-16";

/** Título de seção (`.k3-h2`). */
export const H2 = "font-brand text-[27px] font-semibold leading-[1.18] tracking-[-.022em] text-balance lg:text-[36px]";

/** Fundo cinza das seções alternadas e o lavanda dos ícones e do cartão do herói. */
export const CINZA = "bg-[#F2F4F6]";
export const LAVANDA = "bg-[#E8EEFF]";

/** Pílula acid (`.k3-btn`). Largura total no celular. */
export const BOTAO =
  "inline-flex h-[52px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-acid-500 px-[26px] text-[15.5px] font-bold text-volt-950 transition-colors hover:bg-[#B8FF5C] lg:w-auto";

/** "Testar 7 dias grátis" até o cadastro; com seta nos botões de destaque. */
export function BotaoTeste({ className, seta }: { className?: string; seta?: boolean }) {
  return (
    <a href={SIGNUP_URL} className={cn(BOTAO, FOCO, className)}>
      {CTA_TESTE}
      {seta && <ArrowRight aria-hidden className="size-[18px] shrink-0" />}
    </a>
  );
}
