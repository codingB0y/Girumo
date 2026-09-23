import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { LpFoto } from "@/components/lp-shared/lp-data";
import { cn } from "@/lib/utils";

/**
 * Peças da Cartaz+ usadas em mais de uma seção. Nomes de classe no padrão do
 * mockup (cp-desktop/cp-mobile): .cd vira TITULO, .cd8 vira ROTULO, .etq vira
 * PriceTag e .foto vira Polaroid.
 */

/**
 * Respiro lateral: 18 px no celular; 96 px no desktop do mockup, e dali pra cima
 * o miolo para em 1248 px com o fundo da seção de ponta a ponta. Entre 1024 e
 * 1279 fica em 48 px: com 96, as colunas do desktop não cabem os números de 64 px.
 */
export const LATERAL = "px-[18px] lg:px-12 xl:px-[max(6rem,calc((100%_-_78rem)/2))]";

/**
 * Archivo condensado a 68%, peso 900 (.cd). A família vem da raiz da página.
 * `[line-height:.9]` e não `leading-[.9]`: o tailwind-merge do `cn` apaga um
 * `leading-*` quando um `text-*` vem depois — e o tamanho sempre vem depois.
 */
export const TITULO = "font-black [line-height:.9] tracking-[-.005em] [font-stretch:68%]";

/** Rótulo em caixa alta do cartaz (.cd8). */
export const ROTULO = "font-extrabold [font-stretch:75%]";

export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-950";

/** Borda preta de 1,5 px e canto de 14 px (.card). */
export const CARTAO = "rounded-[14px] border-[1.5px] border-volt-950";

/** Fundo bege da conversa do WhatsApp dentro dos cartões. */
export const FUNDO_WA = "bg-[#EFEAE2] p-2.5 lg:p-3";

/** Bolha (Bubble) na largura do cartão, em 13 px. */
export const BOLHA_CARTAO = "max-w-full text-[13px]";

/**
 * Mesmo lugar, texto diferente: os mockups encurtam a frase no celular. Só uma
 * das duas aparece (a outra fica em display:none), então leitor de tela também
 * lê uma só.
 */
export function ViewportText({ mobile, desktop }: { mobile: ReactNode; desktop: ReactNode }) {
  return (
    <>
      <span className="lg:hidden">{mobile}</span>
      <span className="hidden lg:inline">{desktop}</span>
    </>
  );
}

const TOM = {
  kraft: "bg-[#D9C29C] text-volt-950",
  acid: "bg-acid-500 text-volt-950",
  volt: "bg-volt-950 text-paper-0",
} as const;

interface PriceTagProps {
  tone?: keyof typeof TOM;
  as?: "span" | "h3" | "p";
  /** Tamanho, posição e giro. O padrão é o do desktop: 15 px, 9/18/9/32. */
  className?: string;
  children: ReactNode;
}

/** Etiqueta de preço recortada em seta, com o furo (.etq, .etq-acid, .etq-volt). */
export function PriceTag({ tone = "kraft", as: Tag = "span", className, children }: PriceTagProps) {
  return (
    <Tag
      className={cn(
        // [line-height] pelo mesmo motivo do TITULO: o tamanho do className não pode apagar a altura da linha.
        "relative inline-flex items-center gap-2 whitespace-nowrap py-[9px] pl-8 pr-[18px] text-[15px] font-bold [line-height:1.2]",
        "[clip-path:polygon(18px_0,100%_0,100%_100%,18px_100%,0_50%)]",
        "before:absolute before:left-[13px] before:top-1/2 before:-mt-[4.5px] before:size-[9px] before:rounded-full before:bg-paper-0",
        TOM[tone],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Etiqueta pequena do celular (13 px) que volta ao tamanho padrão no desktop. */
export const ETIQUETA_CEL =
  "py-[7px] pl-7 pr-3.5 text-[13px] lg:py-[9px] lg:pl-8 lg:pr-[18px] lg:text-[15px]";

interface PolaroidProps {
  foto: LpFoto;
  sizes: string;
  /** Tamanho, posição e giro da foto na colagem. */
  className?: string;
  /** Enquadramento (object-position) da imagem. */
  imageClassName?: string;
}

/** Foto de papel (.foto): moldura branca, sombra e a imagem cortada pra caber. */
export function Polaroid({ foto, sizes, className, imageClassName }: PolaroidProps) {
  return (
    <figure
      className={cn(
        "m-0 bg-white p-[10px_10px_14px] shadow-[0_1px_2px_rgba(7,25,35,.14),0_14px_34px_rgba(7,25,35,.14)]",
        className,
      )}
    >
      <span className="relative block size-full">
        <Image src={foto.src} alt={foto.alt} fill sizes={sizes} className={cn("object-cover", imageClassName)} />
      </span>
    </figure>
  );
}

/** "Quero ver funcionando" do meio da página: rola até o formulário do herói. */
export function JumpToFormButton({ className }: { className?: string }) {
  return (
    <a
      href="#comecar"
      className={cn(
        "inline-flex min-h-14 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[10px] bg-volt-950 px-7 text-lg font-extrabold uppercase tracking-[.015em] text-paper-0 [font-stretch:75%] transition-colors hover:bg-volt-800",
        "lg:min-h-[60px] lg:w-auto lg:self-start lg:text-[21px]",
        FOCO,
        className,
      )}
    >
      Quero ver funcionando
      <ArrowRight aria-hidden className="hidden size-[22px] shrink-0 text-acid-500 lg:block" />
    </a>
  );
}
