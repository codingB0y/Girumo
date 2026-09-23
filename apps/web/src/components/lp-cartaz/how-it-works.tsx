import type { ReactNode } from "react";
import { ArrowRight, Check, LinkIcon } from "lucide-react";
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
import { Bubble } from "@/components/lp-shared/whatsapp-mock";
import { cn } from "@/lib/utils";

const PUBLICO: ReadonlyArray<{ celular: string; desktop: string }> = [
  { celular: "Moda infantil", desktop: "Moda infantil" },
  { celular: "Feminina e plus size", desktop: "Moda feminina e plus size" },
  { celular: "Jeans e masculina", desktop: "Jeans e moda masculina" },
  { celular: "Calçados", desktop: "Calçados e acessórios" },
  { celular: "Fábrica com revenda", desktop: "Fábrica que vende pra revenda" },
  { celular: "Loja na 44 ou no Brás", desktop: "Loja na 44, no Brás ou no Bom Retiro" },
  { celular: "Pronta entrega", desktop: "Pronta entrega e reposição" },
  { celular: "Venda pra sacoleira", desktop: "Quem vende pra sacoleira" },
];

/** "Se você vende no atacado pelo WhatsApp, é pra você." — 8 chips. */
export function CartazAudience() {
  return (
    <section
      aria-labelledby="cartaz-publico"
      className={cn(
        "flex flex-col gap-4 pb-9 pt-11 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-start lg:gap-[72px] lg:pb-20 lg:pt-24",
        LATERAL,
      )}
    >
      <div>
        <h2 id="cartaz-publico" className={cn(TITULO, "text-[42px] lg:text-[76px]")}>
          Se você vende no atacado pelo WhatsApp, é pra você.
        </h2>
        <p className="mt-4 leading-[1.55] text-slate-600 lg:mt-6 lg:max-w-[500px] lg:text-[19px]">
          <ViewportText
            mobile="Não é ferramenta de infoproduto adaptada. Nasceu no balcão de um atacado de roupa."
            desktop="Não é ferramenta de infoproduto adaptada pra qualquer um. Nasceu no balcão de um atacado de roupa e fala a língua de quem tem estoque pra girar."
          />
        </p>
      </div>
      <ul className="flex flex-wrap gap-2 lg:grid lg:grid-cols-2 lg:gap-3.5">
        {PUBLICO.map(({ celular, desktop }) => (
          <li
            key={desktop}
            className={cn(
              CARTAO,
              "flex items-center gap-2 bg-white px-3 py-2.5 text-[15px] font-semibold leading-[normal] lg:gap-3.5 lg:px-5 lg:py-[18px] lg:text-lg",
            )}
          >
            <span
              aria-hidden
              className="grid size-[22px] shrink-0 place-items-center rounded-full bg-acid-500 lg:size-[26px]"
            >
              <Check className="size-[13px] lg:size-[15px]" />
            </span>
            <ViewportText mobile={celular} desktop={desktop} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Do link ao pedido": Lota, Posta, Vende. */
export function CartazHowItWorks() {
  return (
    <section
      id="como"
      aria-labelledby="cartaz-como"
      className={cn("border-t-[1.5px] border-volt-950 pb-11 pt-10 lg:border-t-0 lg:pb-24 lg:pt-0", LATERAL)}
    >
      {/* No desktop o fio é do miolo (dentro do respiro), não da largura toda. */}
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-12 lg:border-t-[1.5px] lg:border-volt-950 lg:pt-20">
        <h2 id="cartaz-como" className={cn(TITULO, "text-[42px] lg:max-w-[760px] lg:text-[76px]")}>
          Do link ao pedido, a Girumo faz a parte chata.
        </h2>
        <p className="hidden text-[19px] leading-[1.55] text-slate-600 lg:block lg:max-w-[380px]">
          Você cuida da peça e do cliente. O resto roda no seu número de sempre.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-6 lg:mt-[52px] lg:grid lg:grid-cols-3">
        <Step
          nome="Lota"
          titulo={<ViewportText mobile="O link nunca morre." desktop="O link que enche o grupo e nunca morre" />}
          texto={
            <ViewportText
              mobile="Um link só no anúncio, na bio e no story. Lotou, o próximo grupo nasce sozinho."
              desktop="Um link só no anúncio, na bio e no story. Ele leva pra uma página com a sua marca e dali pro grupo. Lotou? O próximo grupo nasce sozinho."
            />
          }
        >
          <FillCard />
        </Step>
        <Step
          nome="Posta"
          titulo={<ViewportText mobile="A novidade em todos, num clique." desktop="A novidade em todos os grupos, num clique" />}
          texto={
            <ViewportText
              mobile="Vê como chega no celular da cliente e posta. Ou agenda pra 7h."
              desktop="Escreve uma vez, vê como vai chegar no celular da cliente e posta em todos. Ou agenda pra 7h, antes do revendedor montar o pedido."
            />
          }
        >
          <PostCard />
        </Step>
        <Step
          nome="Vende"
          ultimo
          titulo={<ViewportText mobile="Cada pedido com origem." desktop="Cada pedido volta com a origem" />}
          texto={
            <ViewportText
              mobile="Anúncio, story ou grupo: você para de chutar onde pôr dinheiro."
              desktop="Anotou a venda, a Girumo mostra se veio do anúncio, do story ou de qual grupo. Você para de chutar onde pôr dinheiro."
            />
          }
        >
          <SalesCard />
        </Step>
      </div>
      <JumpToFormButton className="mt-6 lg:mt-11" />
    </section>
  );
}

interface StepProps {
  nome: string;
  /** "Vende" fecha a sequência: fundo acid e sem seta. */
  ultimo?: boolean;
  titulo: ReactNode;
  texto: ReactNode;
  children: ReactNode;
}

/**
 * No desktop, título (h3) e texto em blocos; no celular viram um parágrafo só,
 * com o começo em negrito — por isso os dois ficam `inline` até o lg.
 */
function Step({ nome, ultimo = false, titulo, texto, children }: StepProps) {
  return (
    <article className="flex flex-col gap-3 lg:gap-[18px]">
      <p className="flex items-center gap-3.5">
        <span className={cn(TITULO, "text-[42px] lg:text-[64px]", ultimo && "bg-acid-500 px-2 lg:px-2.5")}>{nome}</span>
        {!ultimo && <ArrowRight aria-hidden className="hidden size-[34px] shrink-0 lg:block" />}
      </p>
      {children}
      <div className="leading-normal lg:flex lg:flex-col lg:gap-[18px]">
        <h3 className="inline font-bold lg:block lg:text-[22px] lg:font-extrabold lg:leading-[normal]">{titulo}</h3>{" "}
        <p className="inline text-slate-600 lg:block lg:text-[17px] lg:leading-[1.55]">{texto}</p>
      </div>
    </article>
  );
}

function Bar({ cheia }: { cheia?: boolean }) {
  return (
    <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-[#E5E3DB]">
      <span className={cn("block h-full rounded-full", cheia ? "w-full bg-danger-700" : "w-[2%] bg-volt-950")} />
    </span>
  );
}

const LINHA_GRUPO = "flex justify-between gap-3 text-[13px] font-bold leading-[normal] lg:text-[15px]";

function FillCard() {
  return (
    <div className={cn(CARTAO, "flex flex-col gap-2.5 bg-white p-4 lg:gap-3.5 lg:p-[22px]")}>
      <p className={LINHA_GRUPO}>
        <span>
          <span className="hidden lg:inline">Mega Stock </span>Infantil #2
        </span>
        <span className="tabular-nums text-danger-700">lotou · 1.024/1.024</span>
      </p>
      <Bar cheia />
      <p className={cn(LINHA_GRUPO, "lg:mt-1.5")}>
        <span>
          <span className="hidden lg:inline">Mega Stock </span>Infantil #3
        </span>
        <span className="tabular-nums">
          nasceu agora<span className="hidden lg:inline"> · 0/1.024</span>
        </span>
      </p>
      <Bar />
      <PriceTag tone="acid" className="mt-1 hidden self-start text-sm lg:inline-flex">
        <LinkIcon aria-hidden className="size-[15px] shrink-0" />o link já leva pro #3
      </PriceTag>
    </div>
  );
}

function PostCard() {
  return (
    <div className={cn(CARTAO, "flex flex-col gap-2.5 bg-white p-4 lg:gap-3.5 lg:p-[22px]")}>
      <div className={cn(FUNDO_WA, "rounded-[10px]")}>
        <Bubble me time="prévia" className={BOLHA_CARTAO}>
          <b>NOVIDADES DO DIA</b> · 40 modelos<ViewportText mobile="." desktop=" na pronta entrega." /> Comenta{" "}
          <b>EU QUERO</b>!
        </Bubble>
      </div>
      <p className="grid grid-cols-2 overflow-hidden rounded-[10px] border-[1.5px] border-volt-950 text-center text-sm font-bold leading-[normal] lg:text-[15px]">
        <span className="p-2.5">Postar agora</span>
        <span className="bg-volt-950 p-2.5 text-paper-0">
          Agendar<ViewportText mobile=" " desktop=" · " />
          07:00
        </span>
      </p>
      <p className="hidden justify-between text-[15px] font-bold leading-[normal] lg:flex">
        <span>Grupos</span>
        <span className="tabular-nums">47 de 47 marcados</span>
      </p>
    </div>
  );
}

/** `linha` = exibição e fio de baixo de cada pedido: no celular o mockup mostra só os dois primeiros. */
const VENDAS = [
  { nome: "Marina", valor: "R$ 186", origem: "anúncio", origemCelular: "anúncio", linha: "flex border-b" },
  { nome: "Cleide", valor: "R$ 342", origem: "grupo VIP 12", origemCelular: "VIP 12", linha: "flex lg:border-b" },
  { nome: "Ana Paula", valor: "R$ 518", origem: "story", origemCelular: "story", linha: "hidden" },
] as const;

function SalesCard() {
  return (
    <div className={cn(CARTAO, "bg-white px-4 py-1 lg:px-[22px] lg:py-2")}>
      {VENDAS.map(({ nome, valor, origem, origemCelular, linha }) => (
        <p
          key={nome}
          className={cn(
            "items-center justify-between gap-3.5 border-line-200 py-[11px] text-sm lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:py-3.5 lg:text-[15px]",
            linha,
          )}
        >
          <b>
            {nome}
            <span className="lg:hidden"> · {valor}</span>
          </b>
          <span className="hidden font-bold tabular-nums lg:inline">{valor}</span>
          <PriceTag className="py-1 pl-[22px] pr-2.5 text-xs lg:py-[5px] lg:pl-6">
            <ViewportText mobile={origemCelular} desktop={origem} />
          </PriceTag>
        </p>
      ))}
    </div>
  );
}
