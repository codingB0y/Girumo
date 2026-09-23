import Image from "next/image";
import { Play, ShieldCheck } from "lucide-react";
import {
  ETIQUETA_CEL,
  FOCO,
  LATERAL,
  Polaroid,
  PriceTag,
  TITULO,
  ViewportText,
} from "@/components/lp-cartaz/cartaz-ui";
import { FOTOS, PRINT_GRUPOS } from "@/components/lp-shared/lp-data";
import { cn } from "@/lib/utils";

/**
 * O vídeo de 42 s do Saldão que já está no ar (o mesmo do BazarVideo da /lp3).
 * Aqui é link, e não o BazarVideo: o estilo dele mora no lp3.css, que só a /lp3
 * carrega, e o cartão dele é um 9:16 escuro que não é o do mockup.
 */
const VIDEO_URL = "https://vimeo.com/1207228037";

/** "Avisou no grupo. Deu fila na calçada." — a prova com as fotos do Saldão. */
export function CartazProof() {
  return (
    <section
      id="prova"
      aria-labelledby="cartaz-prova"
      className={cn(
        "flex flex-col gap-4 border-y-[1.5px] border-volt-950 bg-canvas-100 pb-12 pt-11",
        "lg:grid lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:py-24",
        LATERAL,
      )}
    >
      {/* `contents` no celular: os filhos entram direto na coluna da seção, e o
          `order-1` joga etiquetas e vídeo pra depois da colagem, como no mockup. */}
      <div className="contents lg:flex lg:flex-col lg:gap-[22px]">
        <h2 id="cartaz-prova" className={cn(TITULO, "text-[46px] lg:text-[84px]")}>
          Avisou no grupo. Deu fila na calçada.
        </h2>
        <p className="leading-[1.6] lg:text-[19px]">
          Esse é o Saldão da Mega Stock, atacado infantil da região da 44, em Goiânia. O aviso saiu nos grupos de
          WhatsApp. No dia, a fila ia pela calçada antes de a loja abrir.
        </p>
        <p className="hidden text-[19px] leading-[1.6] lg:block">
          A Girumo é esse jeito de vender virando ferramenta: os mesmos grupos e os mesmos posts, testados no nosso
          estoque antes de chegar no seu.
        </p>
        <p className="order-1 flex flex-wrap gap-2 lg:gap-3">
          <PriceTag className={ETIQUETA_CEL}>Atacado infantil · região da 44</PriceTag>
          <PriceTag className={ETIQUETA_CEL}>20 mil peças em 2 dias</PriceTag>
        </p>
        <a
          href={VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "order-1 flex items-center gap-3.5 rounded-[14px] bg-volt-950 p-3.5 text-paper-0 transition-colors hover:bg-volt-800 lg:mt-1.5 lg:gap-[18px] lg:p-4",
            FOCO,
          )}
        >
          <span
            aria-hidden
            className="grid size-[52px] shrink-0 place-items-center rounded-full bg-acid-500 text-volt-950 lg:size-[60px]"
          >
            <Play className="ml-0.5 size-[22px] fill-current lg:size-6" />
          </span>
          <span className="min-w-0">
            <b className="block text-[17px] leading-[normal] lg:text-[19px]">
              Veja o evento em 42 <ViewportText mobile="s" desktop="segundos" />
            </b>
            <span className="block text-sm leading-[normal] text-line-200 lg:text-base">
              <ViewportText
                mobile="Avisado só nos grupos."
                desktop="Loja cheia e fila na porta, avisados só nos grupos."
              />
            </span>
            <span className="sr-only"> (abre o vídeo no Vimeo, em outra aba)</span>
          </span>
        </a>
      </div>
      <ProofCollage />
    </section>
  );
}

/**
 * Celular: loja cheia, print dos grupos e fila na calçada, em larguras
 * percentuais pra caber de 320 a 420 px. Desktop: as quatro fotos e o print,
 * larguras em % da coluna (651 px no mockup de 1440).
 */
function ProofCollage() {
  return (
    <div className="relative mx-auto mt-1.5 h-[660px] w-full max-w-[420px] lg:mx-0 lg:mt-0 lg:h-[820px] lg:max-w-none">
      <Polaroid
        foto={FOTOS.lojaCheia}
        sizes="(min-width: 1024px) 310px, 260px"
        imageClassName="object-[50%_62%]"
        className="absolute left-0 top-1.5 h-[310px] w-[65.5%] -rotate-2 lg:top-0 lg:h-[460px] lg:w-[50.7%]"
      />
      <PriceTag
        className={cn("absolute left-2 top-[296px] z-2 -rotate-3 lg:left-[18px] lg:top-[440px]", ETIQUETA_CEL)}
      >
        Loja cheia no Saldão
      </PriceTag>

      <Polaroid
        foto={FOTOS.filaCalcada}
        sizes="(min-width: 1024px) 280px, 340px"
        imageClassName="object-[50%_52%] lg:object-center"
        className="absolute left-[10.2%] top-[370px] h-[260px] w-[84.7%] rotate-[1.5deg] lg:left-auto lg:right-2 lg:top-[34px] lg:h-[400px] lg:w-[46.1%] lg:rotate-2"
      />
      <PriceTag
        className={cn(
          "absolute left-[13.6%] top-[622px] z-2 -rotate-2 lg:left-auto lg:right-[30px] lg:top-2 lg:rotate-3",
          ETIQUETA_CEL,
        )}
      >
        Fila na calçada antes de abrir
      </PriceTag>

      <Polaroid
        foto={FOTOS.filaDentro}
        sizes="310px"
        imageClassName="object-[50%_46%]"
        className="absolute hidden lg:left-9 lg:top-[500px] lg:block lg:h-[280px] lg:w-[50.7%] lg:rotate-[1.5deg]"
      />
      <PriceTag className="absolute z-2 hidden -rotate-2 lg:left-[60px] lg:top-[762px] lg:inline-flex">
        Peça na mão, fila no caixa
      </PriceTag>

      <figure
        className={cn(
          "absolute right-0 top-10 z-3 m-0 h-[280px] w-[37.3%] rotate-3 overflow-hidden rounded-[20px] border-[6px] border-volt-950 shadow-[0_12px_24px_rgba(7,25,35,.2)]",
          "lg:right-[60px] lg:top-[390px] lg:h-[410px] lg:w-[30.1%] lg:-rotate-3 lg:rounded-[26px] lg:border-[7px] lg:shadow-[0_18px_36px_rgba(7,25,35,.22)]",
        )}
      >
        <Image
          src={PRINT_GRUPOS.src}
          alt={PRINT_GRUPOS.alt}
          fill
          sizes="(min-width: 1024px) 190px, 150px"
          className="object-cover object-top"
        />
      </figure>
      <PriceTag
        tone="acid"
        className={cn("absolute right-0 top-[318px] z-4 -rotate-2 lg:right-6 lg:top-[786px]", ETIQUETA_CEL)}
      >
        <ViewportText mobile="Grupos do Saldão" desktop="Os grupos do Saldão · print real" />
      </PriceTag>
    </div>
  );
}

const SEGURANCA: ReadonlyArray<{ celular: string; desktop: string }> = [
  {
    celular: "Disparo em massa no privado é o que mais derruba número. A Girumo não faz.",
    desktop: "Disparo em massa no privado é o que mais derruba número. A Girumo não faz, por decisão, em nenhum plano.",
  },
  {
    celular: "Posta num ritmo seguro, sem você configurar nada.",
    desktop: "Posta num ritmo seguro, grupo por grupo, sem você configurar intervalo nenhum.",
  },
  {
    celular: "Celular desconectou? Você recebe o aviso na hora.",
    desktop: "Se o celular desconectar, você recebe o aviso na hora e sabe o que fazer.",
  },
];

/** Faixa acid "Só posta em grupo. Nunca manda mensagem no privado." */
export function CartazSafety() {
  return (
    <section
      aria-labelledby="cartaz-seguranca"
      className={cn(
        "flex flex-col gap-[18px] border-b-[1.5px] border-volt-950 bg-acid-500 py-11 lg:grid lg:grid-cols-2 lg:gap-[72px] lg:py-[84px]",
        LATERAL,
      )}
    >
      <h2 id="cartaz-seguranca" className={cn(TITULO, "text-[46px] lg:text-[84px]")}>
        Só posta em grupo. Nunca <span className="hidden lg:inline">manda mensagem </span>no privado.
      </h2>
      <ul className="flex flex-col gap-3.5 leading-[1.45] lg:gap-[22px] lg:self-center lg:text-[19px] lg:leading-normal">
        {SEGURANCA.map(({ celular, desktop }) => (
          <li key={desktop} className="flex gap-3 lg:gap-4">
            <ShieldCheck aria-hidden className="size-6 shrink-0 lg:size-7" />
            <span>
              <ViewportText mobile={celular} desktop={desktop} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
