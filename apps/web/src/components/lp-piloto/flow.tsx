import { ArrowRight, FileText, Megaphone, Receipt, Send, UserPlus, Users, type LucideIcon } from "lucide-react";
import { APOIO_ESCURO, CARTAO, ChaveLigada, Duo, FAIXA, IconeQuadrado, MIOLO, TITULO } from "@/components/lp-piloto/ui";
import { cn } from "@/lib/utils";

/** Rodapé do cartão: número do painel, ou a chave ligada de "automático". */
type Rodape = { tipo: "automatico" } | { tipo: "metrica"; desktop: string; celular?: string };

interface Passo {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  rodape: Rodape;
  /** O passo que o produto resolve sozinho e ninguém mais resolve: ganha o contorno. */
  destaque?: boolean;
}

/* O 4º passo é "quem entrou vira contato": a Girumo NÃO manda boas-vindas. */
const PASSOS: readonly Passo[] = [
  {
    icone: Megaphone,
    titulo: "Anúncio, bio ou story",
    texto: "Um link só em todo lugar.",
    rodape: { tipo: "metrica", desktop: "1.284 cliques" },
  },
  {
    icone: FileText,
    titulo: "Página com a sua marca",
    texto: "Com o seu pixel, pronta em minutos.",
    rodape: { tipo: "metrica", desktop: "botão: entrar no grupo" },
  },
  {
    icone: Users,
    titulo: "Grupo lotou? Abre outro",
    texto: "O link passa a levar pro grupo novo.",
    rodape: { tipo: "automatico" },
    destaque: true,
  },
  {
    icone: UserPlus,
    titulo: "Quem entrou vira contato",
    texto: "E você vê quem saiu de cada grupo.",
    rodape: { tipo: "automatico" },
  },
  {
    icone: Send,
    titulo: "Post em todos os grupos",
    texto: "Agendado pro horário que vende.",
    rodape: { tipo: "metrica", desktop: "08:00 · 47 grupos", celular: "08:00" },
  },
];

function RodapePasso({ rodape }: { rodape: Rodape }) {
  if (rodape.tipo === "automatico") {
    return (
      <span className="flex shrink-0 items-center justify-between gap-2 text-[13px] font-bold lg:mt-auto">
        {/* No celular sobra só a chave; a palavra continua para o leitor de tela. */}
        <span className="sr-only lg:not-sr-only">automático</span>
        <ChaveLigada />
      </span>
    );
  }
  if (!rodape.celular) {
    return <span className="hidden text-[13px] font-bold tabular-nums lg:mt-auto lg:block">{rodape.desktop}</span>;
  }
  return (
    <span className="shrink-0 text-[13px] font-extrabold tabular-nums lg:mt-auto lg:font-bold">
      <Duo celular={rodape.celular} desktop={rodape.desktop} />
    </span>
  );
}

/**
 * Do anúncio ao pedido. No desktop, 5 cartões lado a lado ligados por setas;
 * no celular, cartões em linha (ícone, nome e o estado) um embaixo do outro.
 */
export function PilotoFluxo() {
  return (
    <section
      aria-labelledby="piloto-fluxo"
      className={cn("bg-canvas-100 py-10 lg:pb-[88px] lg:pt-24", FAIXA)}
    >
      <div className={cn(MIOLO, "flex flex-col gap-3.5 lg:gap-11")}>
        <div className="mb-1.5 flex flex-col gap-3.5 lg:mb-0 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <h2 id="piloto-fluxo" className={cn("text-[34px] lg:max-w-[780px] lg:text-[56px]", TITULO)}>
            Enquanto você atende, a Girumo trabalha.
          </h2>
          <p className="text-base leading-normal text-slate-600 lg:max-w-[380px] lg:text-[19px] lg:leading-[1.55]">
            <Duo
              celular="Liga uma vez. Do anúncio ao pedido, roda sozinho."
              desktop="Você liga uma vez. Do anúncio até o pedido, cada passo roda sozinho."
            />
          </p>
        </div>

        <ol className="flex flex-col gap-3.5 lg:grid lg:grid-cols-5 lg:gap-0">
          {PASSOS.map((passo, indice) => (
            <li key={passo.titulo} className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:gap-0">
              <div
                className={cn(
                  CARTAO,
                  "flex min-w-0 grow items-center gap-3 p-3.5 lg:h-full lg:flex-col lg:items-stretch lg:p-[18px]",
                  passo.destaque && "shadow-[0_0_0_2px_#071923]",
                )}
              >
                <IconeQuadrado icone={passo.icone} className="size-10 lg:size-11" iconClassName="size-5 lg:size-[22px]" />
                <p className="grow text-base font-bold leading-snug lg:grow-0 lg:text-[17px]">{passo.titulo}</p>
                <p className="hidden text-sm leading-[1.45] text-slate-600 lg:block">{passo.texto}</p>
                <RodapePasso rodape={passo.rodape} />
              </div>
              {indice < PASSOS.length - 1 && (
                <ArrowRight
                  aria-hidden
                  strokeWidth={2.2}
                  className="size-[18px] shrink-0 rotate-90 self-center text-slate-600 lg:mx-0.5 lg:size-[22px] lg:rotate-0"
                />
              )}
            </li>
          ))}
        </ol>

        <div className="mt-1.5 flex items-center gap-5 rounded-[20px] bg-volt-950 px-4 py-3.5 text-paper-0 shadow-[0_1px_2px_rgba(7,25,35,.06),0_12px_32px_rgba(7,25,35,.08)] lg:mt-0 lg:px-6 lg:py-[18px]">
          <IconeQuadrado icone={Receipt} className="hidden lg:grid" />
          <p className="grow text-[15px] leading-[1.45] lg:text-lg lg:leading-[1.4]">
            {/* Só o primeiro nome, como nas conversas de exemplo. */}
            <b className="font-bold">Pedido de Cleide · R$&nbsp;342</b>{" "}
            <span className={cn("block lg:inline", APOIO_ESCURO)}>
              <Duo
                celular="veio do grupo VIP 12, pelo anúncio da semana"
                desktop="veio do grupo VIP 12, que ela entrou pelo anúncio da semana."
              />
            </span>
          </p>
          <span className="hidden shrink-0 items-center whitespace-nowrap rounded-full border-2 border-acid-500 bg-acid-500 px-4 py-2 text-[13px] font-black uppercase tracking-[.02em] text-volt-950 lg:inline-flex">
            origem rastreada
          </span>
        </div>
      </div>
    </section>
  );
}
