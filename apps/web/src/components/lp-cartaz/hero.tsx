import type { ReactNode } from "react";
import Image from "next/image";
import { Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { WHATSAPP_URL } from "@/components/lp3/landing-data";
import {
  ETIQUETA_CEL,
  FOCO,
  LATERAL,
  PriceTag,
  ROTULO,
  TITULO,
  ViewportText,
} from "@/components/lp-cartaz/cartaz-ui";
import { PERGUNTA_GRUPOS, PERGUNTA_LOJA } from "@/components/lp-shared/lead-message";
import { LeadWizard } from "@/components/lp-shared/lead-wizard";
import { FOTOS } from "@/components/lp-shared/lp-data";
import { Bubble, ChatFrame, SystemNote } from "@/components/lp-shared/whatsapp-mock";
import { cn } from "@/lib/utils";

/** Topo sem menu (CRO): logo e o atalho do WhatsApp — só o ícone no celular. */
export function CartazHeader() {
  return (
    <header
      className={cn("flex items-center justify-between border-b-[1.5px] border-volt-950 py-3 lg:py-[18px]", LATERAL)}
    >
      <Logo className="text-[22px] lg:text-[30px]" />
      <a
        href={WHATSAPP_URL}
        data-outbound="whatsapp_click"
        className={cn(
          "grid size-11 place-items-center rounded-[10px] border-[1.5px] border-volt-950 transition-colors hover:bg-[#F2FFE0]",
          "lg:-my-2 lg:flex lg:size-auto lg:min-h-11 lg:items-center lg:gap-2.5 lg:rounded-none lg:border-0 lg:text-base lg:font-bold lg:hover:bg-transparent lg:hover:text-cobalt-700",
          FOCO,
        )}
      >
        <WhatsAppIcon className="size-[22px] shrink-0" />
        <span className="sr-only lg:not-sr-only">Dúvida? Chama no WhatsApp</span>
      </a>
    </header>
  );
}

const CONFIANCA = [
  { Icone: Check, texto: "Seu número de sempre" },
  { Icone: ShieldCheck, texto: "Nunca manda no privado" },
  { Icone: Check, texto: "7 dias pra desistir" },
] as const;

export function CartazHero() {
  return (
    <section
      aria-labelledby="cartaz-titulo"
      className={cn(
        "grid gap-4 pb-[26px] pt-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:pb-[72px] lg:pt-11",
        LATERAL,
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <PriceTag className="hidden self-start lg:inline-flex">Grupos de WhatsApp pra atacado de moda</PriceTag>
        {/* min(50px, 12.85vw): 50 px de 390 pra cima; em celular de 360 encolhe
            pra "Pedido chegando." não quebrar em duas linhas. */}
        <h1 id="cartaz-titulo" className={cn(TITULO, "text-[length:min(50px,12.85vw)] lg:text-[64px] xl:text-[80px]")}>
          Grupo cheio.
          <br />
          Novidade no ar.
          <br />
          <span className="-ml-2 bg-acid-500 px-2 lg:-ml-3 lg:px-3">Pedido chegando.</span>
        </h1>
        <p className="leading-normal lg:max-w-[590px] lg:text-[19px]">
          A Girumo enche seus grupos de revendedores, posta as novidades em todos de uma vez e mostra de{" "}
          <ViewportText mobile="onde" desktop="qual grupo" /> veio cada pedido.
          <span className="hidden lg:inline">
            {" "}
            Criada por quem levou um atacado de <b>R$ 5 mil a R$ 350 mil por mês</b>.
          </span>
        </p>
        <div id="comecar">
          <LeadWizard variant="cartaz" steps={[PERGUNTA_LOJA, PERGUNTA_GRUPOS]} />
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold leading-[normal] lg:gap-[22px] lg:text-base">
          {CONFIANCA.map(({ Icone, texto }) => (
            <li key={texto} className="flex items-center gap-1.5 lg:gap-2">
              <Icone aria-hidden className="size-4 shrink-0 lg:size-[18px]" />
              {texto}
            </li>
          ))}
        </ul>
      </div>
      <HeroCollage />
    </section>
  );
}

/**
 * Celular: a fachada vira faixa no topo do herói, com o cartaz e a etiqueta por
 * cima (order-first), pra 1ª tela ter foto, título e formulário. Desktop: foto de
 * papel inclinada, cartaz, etiqueta e a conversa do grupo, à direita.
 */
function HeroCollage() {
  return (
    <div className="relative order-first h-[188px] lg:order-none lg:h-[780px]">
      <figure
        className={cn(
          "absolute inset-x-0 bottom-3 top-0 m-0 overflow-hidden rounded-[14px] border-[1.5px] border-volt-950",
          "lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-9 lg:h-[600px] lg:w-[420px] lg:rotate-2 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-white lg:p-[10px_10px_14px] lg:shadow-[0_1px_2px_rgba(7,25,35,.14),0_14px_34px_rgba(7,25,35,.14)]",
        )}
      >
        <span className="relative block size-full">
          <Image
            src={FOTOS.filaFachada.src}
            alt={FOTOS.filaFachada.alt}
            fill
            priority
            sizes="(min-width: 1024px) 400px, 100vw"
            className="object-cover object-[50%_62%] lg:object-[50%_78%]"
          />
        </span>
      </figure>

      <p
        className={cn(
          // leading-[normal]: as linhas pequenas do cartaz seguem a métrica da Archivo, como no mockup.
          // nowrap: entre 1024 e 1439 a coluna estreita quebraria "R$ 350 MIL" em duas linhas.
          "absolute right-2 top-2.5 z-2 -rotate-4 whitespace-nowrap border-[1.5px] border-volt-950 bg-acid-500 px-3 pb-2 pt-1.5 text-center leading-[normal] shadow-[0_8px_16px_rgba(7,25,35,.2)]",
          "lg:left-[150px] lg:right-auto lg:top-0 lg:px-[22px] lg:pb-4 lg:pt-3.5 lg:shadow-[0_12px_26px_rgba(7,25,35,.2)]",
        )}
      >
        <span className={cn(ROTULO, "block text-[11px] tracking-[.04em] lg:text-[17px]")}>DE R$ 5 MIL</span>{" "}
        <span className={cn(TITULO, "block text-[30px] tabular-nums lg:text-[58px]")}>R$ 350 MIL</span>{" "}
        <span className={cn(ROTULO, "block text-[11px] tracking-[.04em] lg:text-[17px]")}>
          POR MÊS<span className="hidden lg:inline"> · MEGA STOCK</span>
        </span>
      </p>

      {/* z-4, acima da conversa: em 1440 os dois não se tocam, mas abaixo disso a
          conversa (z-3) cobriria o começo da etiqueta. */}
      <PriceTag
        tone="acid"
        className={cn(
          "absolute bottom-0 left-1.5 z-4 -rotate-2 lg:bottom-auto lg:left-auto lg:right-[18px] lg:top-[610px] lg:-rotate-3",
          ETIQUETA_CEL,
        )}
      >
        Fila na porta no dia do Saldão
      </PriceTag>

      <div className="absolute bottom-0 left-0 z-3 hidden lg:block">
        <HeroChat />
      </div>
    </div>
  );
}

function HeroChat() {
  return (
    <ChatFrame title="Mega Stock Atacado #109" subtitle="578 participantes" avatar="MS" className="h-[440px] w-[290px]">
      <Bubble me time="07:00" read>
        <span className="relative mb-1.5 block h-24 overflow-hidden rounded-md">
          <Image
            src={FOTOS.clientesNaArara.src}
            alt=""
            fill
            sizes="240px"
            className="object-cover object-[50%_30%]"
          />
        </span>
        <b>LANÇAMENTO · COLEÇÃO VERÃO</b>
        <br />
        40 modelos · pronta entrega
        <br />
        Comenta <b>EU QUERO</b>
      </Bubble>
      <Bubble name="Josiane" nameColor="#1B6FD6" time="07:01">
        EU QUERO o 3 e o 7
      </Bubble>
      <Bubble name="Kelly" nameColor="#B4237A" time="07:01">
        quero! tem G?
      </Bubble>
      <Bubble name="Luciene" nameColor="#087A5E" time="07:02">
        separa 2 de cada, manda o pix
      </Bubble>
      <SystemNote>Tatiane entrou usando o link de convite</SystemNote>
    </ChatFrame>
  );
}

const UNIDADE = "mt-[5px] text-[19px] lg:mt-2 lg:text-[26px] xl:text-[32px]";

const NUMEROS: ReadonlyArray<{ valor: ReactNode; celular: string; desktop: string }> = [
  {
    valor: (
      <>
        <span className={UNIDADE}>R$</span> 350 <span className={UNIDADE}>mil</span>
      </>
    ),
    celular: "por mês, começando com R$ 5 mil",
    desktop: "por mês na Mega Stock, que começou com R$ 5 mil",
  },
  { valor: "12.000", celular: "revendedores nos grupos", desktop: "revendedores dentro dos grupos" },
  { valor: "50+", celular: "grupos rodando juntos", desktop: "grupos rodando ao mesmo tempo" },
  {
    valor: (
      <>
        20 <span className={UNIDADE}>mil</span>
      </>
    ),
    celular: "peças em 2 dias de evento",
    desktop: "peças vendidas em 2 dias de evento",
  },
];

/** Faixa acid dos números da Mega Stock: 2×2 no celular, 4 colunas com fio no desktop. */
export function CartazNumbers() {
  return (
    <section
      aria-labelledby="cartaz-numeros"
      className={cn("border-y-[1.5px] border-volt-950 bg-acid-500 py-[26px] lg:py-[42px]", LATERAL)}
    >
      <h2 id="cartaz-numeros" className="sr-only">
        A Mega Stock em números
      </h2>
      <ul className="grid grid-cols-2 gap-x-3.5 gap-y-5 lg:grid-cols-4 lg:gap-0">
        {NUMEROS.map(({ valor, celular, desktop }, indice) => (
          <li
            key={desktop}
            className={cn(
              "min-w-0",
              indice > 0 && "lg:border-l-[1.5px] lg:border-volt-950",
              indice === 0 ? "lg:pr-7" : indice === NUMEROS.length - 1 ? "lg:pl-7" : "lg:px-7",
            )}
          >
            <p className={cn(TITULO, "flex items-start gap-[3px] text-[48px] tabular-nums lg:gap-1 lg:text-[64px] xl:text-[84px]")}>
              {valor}
            </p>
            <p className="mt-1.5 text-sm font-semibold leading-[1.3] lg:mt-2.5 lg:text-[17px] lg:leading-[1.35]">
              <ViewportText mobile={celular} desktop={desktop} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
