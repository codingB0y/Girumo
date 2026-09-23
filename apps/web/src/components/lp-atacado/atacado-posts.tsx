import Image from "next/image";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Calendar,
  ImageIcon,
  Megaphone,
  Repeat,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { CONTEUDO, FOCO, GRIFO, ICONE, LATERAIS, PILULA, TITULO } from "@/components/lp-atacado/atacado-ui";
import { WHATSAPP_URL } from "@/components/lp3/landing-data";
import { FOTOS } from "@/components/lp-shared/lp-data";
import { Bubble } from "@/components/lp-shared/whatsapp-mock";
import { cn } from "@/lib/utils";

/** Fundo de conversa dentro do cartão. Só no desktop: o mockup do celular deixa o cartão em texto. */
const CONVERSA = "hidden flex-col gap-1.5 rounded-2xl bg-[#EFEAE2] p-3 lg:flex";
const TEXTO = "text-[15px] font-medium leading-[1.45] lg:text-[17px] lg:leading-normal";

/** A contagem do lançamento. `resto` só aparece no desktop, onde o cartão é mais largo. */
const LANCAMENTO = [
  { quando: "3 dias antes", curto: "Vem aí", resto: " a coleção verão" },
  { quando: "Véspera", curto: "Amanhã, 8h", resto: ", abre tudo" },
  { quando: "Hoje, 8h", curto: "ABRIU!", resto: " Comenta EU QUERO" },
] as const;

const FILA_DA_PROMOCAO = ["Josiane", "Kelly", "Tatiane"] as const;

interface CartaoPostProps {
  titulo: string;
  icone: LucideIcon;
  /** Cartão acid, com sombra dura: o do meio. */
  destaque?: boolean;
  /** Linha de rodapé, só no desktop. */
  rodape: string;
  iconeRodape: LucideIcon;
  children: ReactNode;
}

function CartaoPost({
  titulo,
  icone: Icone,
  destaque = false,
  rodape,
  iconeRodape: IconeRodape,
  children,
}: CartaoPostProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2.5 rounded-[20px] border-2 border-volt-950 p-[18px] lg:gap-4 lg:rounded-3xl lg:p-6",
        destaque ? "bg-acid-500 shadow-[0_6px_0_#071923] lg:shadow-[0_8px_0_#071923]" : "bg-white",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className={`${TITULO} text-2xl lg:text-[28px]`}>{titulo}</h3>
        <span aria-hidden className={cn(ICONE, "size-[38px] lg:size-11", destaque && "bg-volt-950 text-acid-500")}>
          <Icone className="size-5 lg:size-[22px]" />
        </span>
      </div>
      {children}
      <p className="mt-auto hidden items-center gap-2 text-sm font-extrabold lg:flex">
        <IconeRodape aria-hidden className="size-[18px] shrink-0" />
        {rodape}
      </p>
    </article>
  );
}

/** "Os 3 posts que mais vendem no atacado": postar novidades, lançamento de coleção e promoções. */
export function PostsQueVendem() {
  return (
    <section aria-labelledby="posts-titulo" className={cn(LATERAIS, "py-10 lg:pb-[88px] lg:pt-24")}>
      <div className={cn(CONTEUDO, "flex flex-col gap-3.5 lg:gap-10")}>
        <h2 id="posts-titulo" className={`${TITULO} text-[34px] lg:max-w-[980px] lg:text-[52px]`}>
          Os 3 posts que mais vendem<span className="hidden lg:inline"> no atacado</span>.{" "}
          <span className={GRIFO}>No automático.</span>
        </h2>

        <div className="grid gap-3.5 lg:grid-cols-3 lg:gap-[22px]">
          <CartaoPost
            titulo="Postar novidades"
            icone={ImageIcon}
            rodape="Agenda a semana inteira de uma vez"
            iconeRodape={Calendar}
          >
            <div className={CONVERSA}>
              <Bubble me time="06:30" read className="max-w-full">
                <div className="relative mb-1.5 h-[110px] overflow-hidden rounded-md">
                  <Image
                    src={FOTOS.clientesNaArara.src}
                    alt=""
                    fill
                    sizes="340px"
                    className="object-cover object-[50%_26%]"
                  />
                </div>
                <b>CHEGOU HOJE</b> · 12 modelos novos na pronta entrega
              </Bubble>
            </div>
            <p className={TEXTO}>
              Todo dia cedo, em todos os grupos, com foto e vídeo.
              <span className="hidden lg:inline"> A revendedora vê a novidade primeiro com você.</span>
            </p>
          </CartaoPost>

          <CartaoPost
            titulo="Lançamento de coleção"
            icone={Megaphone}
            destaque
            rodape="Sequência de posts automática"
            iconeRodape={Repeat}
          >
            <ol className="flex flex-col gap-1.5 text-sm lg:gap-2.5 lg:text-[15px]">
              {LANCAMENTO.map(({ quando, curto, resto }, indice) => (
                <li
                  key={quando}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border-2 border-volt-950 px-3 py-[9px] lg:gap-3 lg:rounded-[14px] lg:px-3.5 lg:py-3",
                    indice === LANCAMENTO.length - 1 ? "bg-volt-950 text-paper-0" : "bg-white",
                  )}
                >
                  <b className="w-[86px] shrink-0 tabular-nums lg:w-[92px]">{quando}</b>
                  <span>
                    {curto}
                    <span className="hidden lg:inline">{resto}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className={cn(TEXTO, "font-semibold")}>
              Aquece o grupo<span className="hidden lg:inline">, conta os dias</span> e abre as vendas na hora marcada,
              em todos<span className="hidden lg:inline"> os grupos</span> juntos.
            </p>
          </CartaoPost>

          <CartaoPost titulo="Promoções" icone={Tag} rodape="Promoção relâmpago com fila" iconeRodape={Zap}>
            <div className={CONVERSA}>
              <Bubble me time="14:00" className="max-w-full">
                <b>PROMOÇÃO RELÂMPAGO</b> · 20 peças do bota-fora. Quem comentar <b>EU QUERO</b> primeiro leva
              </Bubble>
              <ol aria-label="Quem comentou primeiro" className="flex flex-wrap gap-1.5 text-xs font-extrabold">
                {FILA_DA_PROMOCAO.map((nome, indice) => (
                  <li
                    key={nome}
                    className={cn("rounded-full px-2.5 py-[5px]", indice === 0 ? "bg-volt-950 text-paper-0" : "bg-white")}
                  >
                    {indice + 1}º {nome}
                  </li>
                ))}
              </ol>
            </div>
            <p className={TEXTO}>
              Bota-fora e <span className="lg:hidden">relâmpago</span>
              <span className="hidden lg:inline">queima de estoque</span>: quem comenta primeiro leva, e a fila se
              organiza sozinha<span className="hidden lg:inline"> no grupo</span>.
            </p>
          </CartaoPost>
        </div>

        <div className="mt-1.5 flex items-center gap-6 lg:mt-0">
          <a
            href="#comecar"
            className={cn(
              PILULA,
              "w-full bg-volt-950 text-paper-0 shadow-[0_5px_0_#071923] hover:bg-volt-800 lg:w-auto",
              FOCO,
            )}
          >
            Quero postar assim
            <ArrowRight aria-hidden className="size-5 shrink-0 text-acid-500" />
          </a>
          <a
            href={WHATSAPP_URL}
            data-outbound="whatsapp_click"
            className={cn(
              "hidden min-h-11 items-center text-base font-bold underline underline-offset-4 lg:inline-flex",
              FOCO,
            )}
          >
            ou fala com a gente no WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
