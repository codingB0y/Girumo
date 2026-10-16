import Image from "next/image";
import { ArrowRight, ChartColumn, Link2, Pointer, Send, Users, Zap, type LucideIcon } from "lucide-react";
import { IMG, plano, reais, type ImagemHome } from "@/components/home-shared/home-data";
import { Celular } from "@/components/home-shared/frames";
import { APOIO, BotaoTeste, FOCO, H2, MIOLO, TINTA, TOPO } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

const RAMOS = ["Moda", "Cosméticos", "Suplementos", "Pet shop", "Mercado", "Eletrônicos", "Atacado", "Doceria"] as const;

/** Faixa de ramos logo abaixo do herói (no lugar dos logos de cliente da Tray). */
export function VitrineRamos() {
  return (
    <section aria-labelledby="ramos-titulo" className="px-[18px] pb-7 pt-9 text-center lg:px-6 lg:pb-11 lg:pt-[50px]">
      <h2 id="ramos-titulo" className="text-[14.5px] text-slate-600">
        Serve pra qualquer loja que vende em grupo de WhatsApp
      </h2>
      <ul className="mt-[18px] flex flex-wrap justify-center gap-x-[22px] gap-y-2 lg:gap-x-12 lg:gap-y-3">
        {RAMOS.map((ramo) => (
          <li key={ramo} className="font-brand text-[17px] font-extrabold tracking-[-.01em] text-[#66777F] lg:text-[21px]">
            {ramo}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Print do computador recortado no canto de cima (colagem do painel). */
function Recorte({ img, alt, className }: { img: ImagemHome; alt: string; className?: string }) {
  return (
    <figure
      className={cn(
        "relative h-[250px] overflow-hidden rounded-2xl border border-[#E3EADF] bg-[#F1F4F2] lg:h-[400px] lg:rounded-[20px]",
        className,
      )}
    >
      <Image src={img.src} alt={alt} fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover object-left-top" />
    </figure>
  );
}

/** "Seus grupos, seus posts e suas vendas num painel só": colagem de 3 telas reais. */
export function VitrinePainel() {
  return (
    <section id="como" aria-labelledby="painel-titulo" className="scroll-mt-4 pb-16 pt-[52px] lg:pb-24 lg:pt-[72px]">
      <div className={cn(MIOLO, TOPO)}>
        <h2 id="painel-titulo" className={H2}>
          Seus grupos, seus posts e suas vendas num painel só
        </h2>
        <div>
          <p className={APOIO}>
            Você vende no grupo. A Girumo junta o resto: quem entrou, o que foi postado e de onde veio cada venda.
          </p>
          <BotaoTeste />
        </div>
      </div>
      <div
        className={cn(
          MIOLO,
          "mt-[26px] grid grid-cols-2 gap-2.5 lg:mt-11 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.62fr)_minmax(0,1fr)] lg:gap-4",
        )}
      >
        <Recorte
          img={IMG.campanhaDesktop}
          alt="Página da campanha no computador: postar em 36 grupos, entradas, saídas e cliques"
          className="col-span-2 lg:col-span-1"
        />
        <figure className="relative h-[250px] overflow-hidden rounded-2xl bg-volt-950 lg:h-[400px] lg:rounded-[20px]">
          <Celular
            img={IMG.inicioCelular}
            alt="Início no celular com o mapa dos grupos"
            sizes="(min-width: 1024px) 196px, 128px"
            className="absolute left-1/2 top-[22px] w-32 -translate-x-1/2 lg:top-9 lg:w-[196px]"
          />
        </figure>
        <Recorte img={IMG.analiseDesktop} alt="Análise da campanha com entradas e saídas por hora e grupos" />
      </div>
    </section>
  );
}

interface Porte {
  titulo: string;
  plano: string;
  img: ImagemHome;
  alt: string;
}

/* O Growth já tem grupos sem limite (PLANS): o que o Operação acrescenta é a
   gente montando junto, e é isso que o cartão dele diz. */
const PORTES_MENORES: readonly Porte[] = [
  { titulo: "Crescendo", plano: "Growth", img: IMG.fotoMercado, alt: "Funcionário de mercado segurando uma caixa de tomates" },
  { titulo: "Com a gente junto", plano: "Operação", img: IMG.fotoChaves, alt: "Lojista mostrando as chaves da loja" },
];

/* Escurece a metade de baixo da foto, onde fica o texto branco. */
const SOMBRA_FOTO = "absolute inset-0 bg-[linear-gradient(180deg,rgba(7,25,35,0)_35%,rgba(7,25,35,.88)_100%)]";

/** O porte grande: a loja começando, com o preço do Essencial. */
function CartaoComecando() {
  const essencial = plano("Essencial");
  return (
    <article className="relative col-span-2 h-[380px] overflow-hidden rounded-[22px] bg-[#C9D3C0] lg:col-span-1 lg:h-auto">
      <Image
        src={IMG.fotoDonaCafe.src}
        alt="Dona de café sorrindo de braços cruzados no balcão"
        fill
        sizes="(min-width: 1024px) 860px, 100vw"
        className="object-cover"
      />
      <div aria-hidden className={SOMBRA_FOTO} />
      <div className="absolute inset-x-0 bottom-0 p-[18px] text-white lg:px-7 lg:py-[26px]">
        <h3 className="font-brand text-[21px] font-bold tracking-[-.015em] lg:text-2xl">Começando</h3>
        <p className="mt-2 max-w-[32em] text-[15.5px] leading-normal text-white/90">
          Até 5 grupos e um celular conectado. É o plano Essencial: {reais(essencial.price)} por mês, ou{" "}
          {reais(essencial.annualPrice)} por mês no anual.
        </p>
        <a
          href="#planos"
          className="mt-3 inline-flex items-center gap-2 rounded-sm text-[14.5px] font-bold text-acid-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500"
        >
          Ver o Essencial
          <ArrowRight aria-hidden className="size-[17px]" />
        </a>
      </div>
    </article>
  );
}

/** Três portes de loja em foto, cada um apontando pro plano dele. */
export function VitrineTamanhos() {
  return (
    <section id="pra-quem" aria-labelledby="tamanhos-titulo" className={cn(TINTA, "scroll-mt-4 py-[60px] lg:py-24")}>
      <div className={MIOLO}>
        <h2 id="tamanhos-titulo" className={cn(H2, "text-center")}>
          Pra cada tamanho de loja, um jeito de começar
        </h2>
        <div className="mt-[26px] grid grid-cols-2 gap-2.5 lg:mt-10 lg:h-[440px] lg:grid-cols-[minmax(0,1fr)_210px_210px] lg:gap-3.5">
          <CartaoComecando />
          {PORTES_MENORES.map((porte) => (
            <article key={porte.titulo} className="relative h-[240px] overflow-hidden rounded-[22px] bg-[#C9D3C0] lg:h-auto">
              <Image src={porte.img.src} alt={porte.alt} fill sizes="(min-width: 1024px) 210px, 50vw" className="object-cover" />
              <div aria-hidden className={SOMBRA_FOTO} />
              <div className="absolute inset-x-0 bottom-0 p-[18px] text-white lg:px-7 lg:py-[26px]">
                <h3 className="font-brand text-[17px] font-bold leading-[1.2] lg:text-xl">
                  {/* O cartão inteiro é o link (o ::after cobre a foto). */}
                  <a
                    href="#planos"
                    aria-label={`${porte.titulo}: ver o ${porte.plano}`}
                    className="after:absolute after:inset-0 after:rounded-[22px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-acid-500"
                  >
                    {porte.titulo}
                  </a>
                </h3>
                <p className="mt-1 text-[13.5px] text-white/85">{porte.plano}</p>
                <Pointer aria-hidden className="mt-3 size-[22px]" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

interface Recurso {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  destaque?: true;
}

const RECURSOS: readonly Recurso[] = [
  { icone: Link2, titulo: "Um link pra todos os grupos", texto: "Quem clica cai no grupo com vaga e abre direto no app." },
  { icone: Users, titulo: "Grupo lotou, o próximo nasce", texto: "Com o nome em sequência. O link passa a apontar pra ele." },
  {
    icone: Send,
    titulo: "Post em todos os grupos",
    texto: "Escreve uma vez, vê a prévia e posta agora ou na hora marcada.",
    destaque: true,
  },
  { icone: Zap, titulo: "Oferta relâmpago", texto: "Quem comenta EU QUERO primeiro leva. A fila se monta sozinha." },
  { icone: ChartColumn, titulo: "Venda com a origem", texto: "Anúncio, story ou grupo: o painel mostra de onde veio." },
];

/**
 * Os cinco recursos em fila, o do meio em destaque (o carrossel da Tray). No
 * celular vira trilho de arrastar com o destaque primeiro; no desktop, os cinco
 * lado a lado. Sem as bolinhas do mockup: aqui elas não teriam o que controlar.
 */
export function VitrineRecursos() {
  return (
    <section aria-labelledby="recursos-titulo" className="py-[60px] lg:pb-[88px] lg:pt-24">
      <h2 id="recursos-titulo" className={cn(H2, "px-[18px] text-center")}>
        Tudo pra vender no grupo,
        <br className="hidden lg:inline" /> sem complicar
      </h2>
      <div
        role="region"
        aria-label="Recursos"
        tabIndex={0}
        className={cn(
          "mt-7 flex snap-x snap-mandatory scroll-px-[18px] gap-3 overflow-x-auto px-[18px] pb-2 [scrollbar-width:none] lg:mx-auto lg:mt-11 lg:grid lg:max-w-[1440px] lg:grid-cols-[1fr_1fr_1.15fr_1fr_1fr] lg:items-center lg:gap-4 lg:overflow-visible lg:px-16",
          FOCO,
        )}
      >
        {RECURSOS.map(({ icone: Icone, titulo, texto, destaque }) => (
          <article
            key={titulo}
            className={cn(
              "flex w-[236px] shrink-0 snap-start flex-col items-center rounded-[20px] px-[18px] py-[22px] text-center lg:w-auto lg:px-6 lg:py-[26px]",
              destaque
                ? "order-first bg-volt-950 text-white shadow-[0_30px_60px_-30px_rgba(7,25,35,.6)] lg:order-none lg:min-h-[268px]"
                : "border border-[#E3EADF] bg-white lg:min-h-[236px]",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mb-[18px] grid size-12 place-items-center rounded-[14px] text-volt-950",
                destaque ? "bg-acid-500" : "bg-[#F4FAEA]",
              )}
            >
              <Icone className="size-6" />
            </span>
            <h3 className="font-brand text-lg font-bold leading-[1.25]">{titulo}</h3>
            <p className={cn("mt-2.5 text-[14.5px] leading-normal", destaque ? "text-white/80" : "text-slate-600")}>{texto}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
