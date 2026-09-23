import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Título das seções (`.m1-h` do mockup): Manrope 800, apertado. No `cn`, vem
 * DEPOIS do tamanho: o tailwind-merge trata `text-[56px]` como conflito de
 * `leading-*` e descarta o `leading-[1.04]` que estiver antes dele.
 */
export const TITULO = "font-extrabold leading-[1.04] tracking-[-.03em]";

/** Cartão branco do Modelo 1 (`.m1-card`). */
export const CARTAO =
  "rounded-[20px] border border-line-200 bg-white shadow-[0_1px_2px_rgba(7,25,35,.06),0_12px_32px_rgba(7,25,35,.08)]";

/** Faixa de seção: 18 px de margem no celular, 96 px no desktop de 1440. */
export const FAIXA = "px-[18px] lg:px-24";
export const MIOLO = "mx-auto w-full max-w-[1248px]";

/** Texto de apoio sobre o fundo escuro (#C5CFCD: 11:1 no volt-950). */
export const APOIO_ESCURO = "text-[#C5CFCD]";

export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-950";
export const FOCO_ESCURO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500";

/**
 * Texto que muda entre celular e desktop, como nos mockups (o do celular é a
 * versão enxuta). Só uma das duas existe na tela — e no leitor de tela — por vez.
 */
export function Duo({ celular, desktop }: { celular: ReactNode; desktop: ReactNode }) {
  return (
    <>
      <span className="lg:hidden">{celular}</span>
      <span className="hidden lg:inline">{desktop}</span>
    </>
  );
}

interface IconeQuadradoProps {
  icone: LucideIcon;
  /** Tamanho da caixa (padrão 44 px) e cor, quando não é o acid. */
  className?: string;
  /** Tamanho do traço (padrão 22 px). */
  iconClassName?: string;
}

/** Ícone no quadrado acid (`.icq`). Decorativo: o texto ao lado diz o que é. */
export function IconeQuadrado({ icone: Icone, className, iconClassName }: IconeQuadradoProps) {
  return (
    <span
      aria-hidden
      className={cn("grid size-11 shrink-0 place-items-center rounded-xl bg-acid-500 text-volt-950", className)}
    >
      <Icone strokeWidth={2.2} className={cn("size-[22px]", iconClassName)} />
    </span>
  );
}

/** Chave ligada desenhada (`.tog`). É ilustração do painel, não controle. */
export function ChaveLigada({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-block h-6 w-[42px] shrink-0 rounded-full bg-volt-950", className)}>
      <span className="absolute right-[3px] top-[3px] size-[18px] rounded-full bg-acid-500" />
    </span>
  );
}

/** Pílula (`.pill`) — o tamanho e a cor ficam com quem usa. */
export const PILULA =
  "inline-flex min-h-[58px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full border-2 border-volt-950 px-7 text-lg font-extrabold transition-colors";

/** "Quero ver funcionando" do meio da página: rola até o formulário do herói. */
export function BotaoVerFuncionando({ className }: { className?: string }) {
  return (
    <a
      href="#comecar"
      className={cn(
        PILULA,
        "bg-volt-950 text-paper-0 shadow-[0_5px_0_#071923] hover:bg-volt-800",
        FOCO,
        className,
      )}
    >
      Quero ver funcionando
      <ArrowRight aria-hidden className="size-5 shrink-0 text-acid-500" />
    </a>
  );
}

/** O lucide-react 1.x tirou os ícones de marca; este é o traçado do antigo `Instagram`. */
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}
