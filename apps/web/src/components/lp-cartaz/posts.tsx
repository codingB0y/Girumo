import type { ReactNode } from "react";
import Image from "next/image";
import { Calendar, ImageIcon, Megaphone, Repeat, Tag, Zap, type LucideIcon } from "lucide-react";
import {
  BOLHA_CARTAO,
  CARTAO,
  FUNDO_WA,
  JumpToFormButton,
  LATERAL,
  PriceTag,
  TITULO,
  ViewportText,
} from "@/components/lp-cartaz/cartaz-ui";
import { FOTOS } from "@/components/lp-shared/lp-data";
import { Bubble } from "@/components/lp-shared/whatsapp-mock";
import { cn } from "@/lib/utils";

/** "Os 3 posts que mais vendem no atacado." — postar novidades, lançamento de coleção e promoções. */
export function CartazPosts() {
  return (
    <section
      aria-labelledby="cartaz-posts"
      className={cn("flex flex-col gap-3.5 py-11 lg:gap-11 lg:py-24", LATERAL)}
    >
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
        <h2 id="cartaz-posts" className={cn(TITULO, "text-[42px] lg:max-w-[780px] lg:text-[76px]")}>
          Os 3 posts que mais vendem no atacado.
        </h2>
        <p className="hidden text-[19px] leading-[1.55] text-slate-600 lg:block lg:max-w-[380px]">
          Já vêm montados na Girumo. Você ajusta o texto, escolhe a hora e solta em todos os grupos.
        </p>
      </div>
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-3 lg:gap-[22px]">
        <PostCard
          etiqueta="Postar novidades"
          Icone={ImageIcon}
          texto={
            <>
              Todo dia cedo, em todos os grupos, com foto e vídeo.
              <span className="hidden lg:inline"> Quem vê primeiro, pede primeiro.</span>
            </>
          }
          rodape={{ Icone: Calendar, texto: "Agenda a semana inteira de uma vez" }}
        >
          <div className={cn(FUNDO_WA, "rounded-xl")}>
            <Bubble me time="07:00" read className={`${BOLHA_CARTAO} lg:text-[13.5px]`}>
              <span className="relative mb-1.5 block h-[104px] overflow-hidden rounded-md lg:h-[118px]">
                <Image
                  src={FOTOS.clientesNaArara.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 320px, 300px"
                  className="object-cover object-[50%_28%]"
                />
              </span>
              <b>CHEGOU HOJE</b> · 12 modelos novos na pronta entrega
            </Bubble>
          </div>
        </PostCard>

        <PostCard
          etiqueta="Lançamento de coleção"
          Icone={Megaphone}
          acid
          texto={
            <ViewportText
              mobile="Aquece o grupo e abre as vendas na hora marcada, em todos juntos."
              desktop="Aquece o grupo, conta os dias e abre as vendas na hora marcada, em todos os grupos juntos."
            />
          }
          rodape={{ Icone: Repeat, texto: "Sequência de posts pronta" }}
        >
          <LaunchTimeline />
        </PostCard>

        <PostCard
          etiqueta="Promoções"
          Icone={Tag}
          texto={
            <ViewportText
              mobile="Quem comenta primeiro leva, e a fila se organiza sozinha."
              desktop="Bota-fora e queima de estoque: quem comenta primeiro leva, e a fila se organiza sozinha no grupo."
            />
          }
          rodape={{ Icone: Zap, texto: "Promoção relâmpago com fila" }}
        >
          <div className={cn(FUNDO_WA, "flex flex-col gap-1.5 rounded-xl lg:gap-2")}>
            <Bubble me time="14:00" className={`${BOLHA_CARTAO} lg:text-[13.5px]`}>
              <b>PROMOÇÃO RELÂMPAGO</b> · 20 peças do bota-fora. Quem comentar <b>EU QUERO</b> primeiro leva
            </Bubble>
            <ol aria-label="Fila de quem comentou primeiro" className="flex flex-wrap gap-1.5 text-xs font-extrabold leading-[normal] lg:text-[13px]">
              {["Josiane", "Kelly", "Tatiane"].map((nome, indice) => (
                <li
                  key={nome}
                  className={cn("rounded-full px-2.5 py-[5px]", indice === 0 ? "bg-volt-950 text-paper-0" : "bg-white")}
                >
                  {indice + 1}º {nome}
                </li>
              ))}
            </ol>
          </div>
        </PostCard>
      </div>
      <JumpToFormButton className="mt-1 lg:mt-0" />
    </section>
  );
}

interface PostCardProps {
  etiqueta: string;
  Icone: LucideIcon;
  /** O do meio é o cartaz acid, com etiqueta preta. */
  acid?: boolean;
  texto: ReactNode;
  /** Linha de pé do cartão — só no desktop, como no mockup. */
  rodape: { Icone: LucideIcon; texto: string };
  children: ReactNode;
}

function PostCard({ etiqueta, Icone, acid = false, texto, rodape, children }: PostCardProps) {
  const IconeRodape = rodape.Icone;
  return (
    <article className={cn(CARTAO, "flex flex-col gap-3 p-4 lg:gap-4 lg:p-6", acid ? "bg-acid-500" : "bg-white")}>
      <div className="flex items-center justify-between gap-3">
        <PriceTag as="h3" tone={acid ? "volt" : "kraft"} className="text-sm lg:text-[15px]">
          {etiqueta}
        </PriceTag>
        <Icone aria-hidden className="size-[22px] shrink-0 lg:size-[26px]" />
      </div>
      {children}
      <p className={cn("text-[15px] leading-[1.45] lg:text-[17px] lg:leading-normal", acid && "font-semibold")}>
        {texto}
      </p>
      <p
        className={cn(
          "mt-auto hidden items-center gap-2 text-[15px] leading-[normal] lg:flex",
          acid ? "font-extrabold" : "font-bold text-slate-600",
        )}
      >
        <IconeRodape aria-hidden className="size-[18px] shrink-0" />
        {rodape.texto}
      </p>
    </article>
  );
}

const LINHA_DO_TEMPO = [
  { quando: "3 dias antes", celular: "Vem aí", desktop: "Vem aí a coleção verão" },
  { quando: "Véspera", celular: "Amanhã, 8h", desktop: "Amanhã, 8h, abre tudo" },
  { quando: "Hoje, 8h", celular: "ABRIU!", desktop: "ABRIU! Comenta EU QUERO" },
] as const;

function LaunchTimeline() {
  return (
    <ol className="flex flex-col gap-1.5 text-sm leading-[normal] lg:gap-2.5 lg:text-[15px]">
      {LINHA_DO_TEMPO.map(({ quando, celular, desktop }, indice) => (
        <li
          key={quando}
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-volt-950 px-3 py-[9px] lg:gap-3 lg:px-3.5 lg:py-3",
            indice === LINHA_DO_TEMPO.length - 1 ? "bg-volt-950 text-paper-0" : "bg-paper-0",
          )}
        >
          <b className="w-[88px] shrink-0 tabular-nums lg:w-24">{quando}</b>
          <span className="min-w-0">
            <ViewportText mobile={celular} desktop={desktop} />
          </span>
        </li>
      ))}
    </ol>
  );
}
