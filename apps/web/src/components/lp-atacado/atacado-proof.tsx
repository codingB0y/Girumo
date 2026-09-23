import Image from "next/image";
import { MapPin } from "lucide-react";
import { CONTEUDO, ETIQUETA, LATERAIS, TITULO } from "@/components/lp-atacado/atacado-ui";
import { FOTOS, PRINT_GRUPOS } from "@/components/lp-shared/lp-data";
import { cn } from "@/lib/utils";

/** Fatos da Mega Stock liberados para as landings. Nenhum número além destes. */
const NUMEROS = [
  ["R$ 350 mil", "por mês, vendendo em grupo"],
  ["20 mil", "peças em 2 dias de evento"],
  ["12 mil", "revendedoras nos grupos"],
  ["105 mil", "seguidores no Instagram"],
] as const;

/** Faixa escura logo depois do herói: quem fez a Girumo e os números da Mega Stock. */
export function NumerosMegaStock() {
  return (
    <section aria-labelledby="numeros-titulo" className={cn(LATERAIS, "bg-volt-950 py-[22px] text-paper-0 lg:py-[26px]")}>
      <div
        className={cn(
          CONTEUDO,
          "flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-8 lg:gap-y-4",
        )}
      >
        <div className="flex items-center gap-3 lg:gap-3.5">
          <span className="relative size-10 shrink-0 overflow-hidden rounded-full border-2 border-acid-500 lg:size-12">
            <Image src={FOTOS.filaFachada.src} alt="" fill sizes="48px" className="object-cover object-[50%_62%]" />
          </span>
          <h2 id="numeros-titulo" className="text-balance text-sm font-bold leading-[1.3] lg:text-base lg:leading-[1.35]">
            Criada pela Mega Stock,
            <br className="hidden lg:inline" /> atacado infantil da&nbsp;44
          </h2>
        </div>
        <ul className="grid grid-cols-2 gap-3.5 lg:flex lg:gap-9">
          {NUMEROS.map(([valor, rotulo]) => (
            <li key={valor}>
              <p className={`${TITULO} whitespace-nowrap text-[26px] tabular-nums lg:text-[30px]`}>{valor}</p>
              <p className="mt-[3px] text-xs text-[#C5CFCD] lg:mt-1 lg:text-[13px]">{rotulo}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Ícone do Instagram desenhado aqui: o lucide-react 1.x tirou os ícones de marca. */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </svg>
  );
}

/**
 * "Da 44 pro Brasil": foto real da fila do Saldão + print real dos grupos.
 * No DOM o título vem primeiro (quem navega por título não pula a foto). No
 * celular o texto vira `contents` e o que vem depois da foto leva order-1; no
 * desktop a foto sobe para a coluna da esquerda com lg:order-first.
 */
export function ProvaMegaStock() {
  return (
    <section aria-labelledby="prova-titulo" className={cn(LATERAIS, "py-10 lg:py-24")}>
      <div className={cn(CONTEUDO, "flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14")}>
        <div className="contents lg:flex lg:flex-col lg:gap-[22px]">
          <h2 id="prova-titulo" className={`${TITULO} text-[32px] lg:text-[50px]`}>
            Da 44 pro Brasil: foi assim que a Mega Stock vendeu.
          </h2>
          <p className="hidden text-lg font-medium leading-[1.6] lg:block">
            Atacado infantil da região da 44, tudo feito na mão até cansar. A virada foi o grupo de WhatsApp:
            novidade postada cedo, coleção lançada em todos os grupos juntos, evento avisado só no grupo. A venda
            saiu de R$&nbsp;5&nbsp;mil pra R$&nbsp;350&nbsp;mil por mês.
          </p>
          <p className="order-1 mt-2 rounded-2xl border-2 border-volt-950 bg-canvas-100 p-4 text-base font-bold leading-normal lg:mt-0 lg:rounded-[20px] lg:px-6 lg:py-[22px] lg:text-[19px]">
            Duas vezes por ano o estoque virava evento avisado só nos grupos: fila na porta e 20&nbsp;mil peças em
            2&nbsp;dias.
          </p>
          <p className="order-1 flex items-center gap-2 text-sm font-extrabold lg:gap-2.5 lg:text-[15px]">
            <InstagramIcon className="size-4 shrink-0 lg:size-[18px]" />
            @megainfantilatacado · 105&nbsp;mil seguidores
          </p>
        </div>

        <div className="relative mt-1 lg:order-first lg:mt-0 lg:h-[520px]">
          <figure className="relative m-0 h-[230px] -rotate-[1.5deg] bg-white p-2.5 pb-3.5 shadow-[0_1px_2px_rgba(7,25,35,.14),0_14px_34px_rgba(7,25,35,.14)] lg:absolute lg:left-0 lg:top-0 lg:h-[460px] lg:w-[360px] lg:-rotate-[2.5deg]">
            <div className="relative size-full">
              <Image
                src={FOTOS.filaCalcada.src}
                alt={FOTOS.filaCalcada.alt}
                fill
                sizes="(min-width: 1024px) 340px, 100vw"
                className="object-cover object-[50%_58%] lg:object-center"
              />
            </div>
          </figure>
          <p
            className={cn(
              ETIQUETA,
              "absolute -bottom-3 left-3 -rotate-3 bg-acid-500 px-3 py-1.5 text-xs lg:bottom-auto lg:left-5 lg:top-[440px] lg:px-4 lg:py-2 lg:text-[15px]",
            )}
          >
            <MapPin aria-hidden className="size-3.5 shrink-0 lg:size-4" />
            Fila no dia do Saldão
          </p>
          <figure className="absolute right-[30px] top-[30px] m-0 hidden h-[412px] w-[190px] rotate-3 overflow-hidden rounded-[26px] border-[7px] border-volt-950 shadow-[0_8px_0_#071923] lg:block">
            <Image src={PRINT_GRUPOS.src} alt={PRINT_GRUPOS.alt} fill sizes="180px" className="object-cover object-top" />
          </figure>
        </div>
      </div>
    </section>
  );
}
