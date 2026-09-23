import Image from "next/image";
import {
  Calendar,
  ImageIcon,
  Link as LinkIcon,
  Send,
  TrendingUp,
  UserPlus,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FOTOS } from "@/components/lp-shared/lp-data";
import { Bubble } from "@/components/lp-shared/whatsapp-mock";
import {
  BotaoVerFuncionando,
  CARTAO,
  ChaveLigada,
  Duo,
  FAIXA,
  IconeQuadrado,
  MIOLO,
  TITULO,
} from "@/components/lp-piloto/ui";
import { cn } from "@/lib/utils";

const RECURSOS: ReadonlyArray<{ icone: LucideIcon; titulo: string; texto: string }> = [
  { icone: Zap, titulo: "Oferta relâmpago", texto: "Quem comenta primeiro leva. A fila se organiza sozinha." },
  { icone: Calendar, titulo: "Semana agendada", texto: "Monta a sequência de posts uma vez e ela roda todo dia." },
  { icone: UserPlus, titulo: "Contatos de quem entrou", texto: "Cada pessoa que entra vira contato. E você vê quem saiu." },
  { icone: TrendingUp, titulo: "Relatório de vendas", texto: "Clique, entrada, pedido e valor, por grupo e por anúncio." },
];

const GRUPOS = [
  { nome: "VIP Promoções #08", estado: "lotou", cheio: true },
  { nome: "VIP Promoções #09", estado: "nasceu agora", cheio: false },
] as const;

const CARTAO_GRANDE = cn(CARTAO, "flex min-w-0 flex-col gap-3 p-[18px] lg:gap-[18px] lg:p-7");
const TITULO_CARTAO = "text-[19px] font-extrabold leading-tight lg:text-2xl";
const TEXTO_CARTAO = "hidden text-[17px] leading-normal text-slate-600 lg:block";

function CabecalhoCartao({ icone, children }: { icone: LucideIcon; children: string }) {
  return (
    <div className="flex items-center gap-3 lg:gap-3.5">
      <IconeQuadrado icone={icone} className="size-10 lg:size-11" iconClassName="size-5 lg:size-[22px]" />
      <h3 className={TITULO_CARTAO}>{children}</h3>
    </div>
  );
}

/** Post de exemplo: a bolha como chega no grupo e, ao lado, o agendamento. */
function CartaoMensagem() {
  return (
    <article className={CARTAO_GRANDE}>
      <CabecalhoCartao icone={Send}>Uma mensagem. Todos os grupos.</CabecalhoCartao>
      <p className={TEXTO_CARTAO}>
        Escreve uma vez, vê como chega no celular do cliente e posta agora ou agenda. Texto, foto e vídeo.
      </p>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px] lg:gap-4">
        <div className="flex min-w-0 flex-col rounded-xl bg-[#EFEAE2] p-2.5 lg:rounded-[14px] lg:p-3.5">
          <Bubble me time="08:00" read className="max-w-full text-[13px] lg:text-[13.5px]">
            <span className="relative mb-1.5 block h-[70px] overflow-hidden rounded-md">
              <Image
                src={FOTOS.clientesNaArara.src}
                alt={FOTOS.clientesNaArara.alt}
                fill
                sizes="(min-width: 1280px) 330px, (min-width: 1024px) 560px, 300px"
                className="object-cover object-[50%_28%]"
              />
            </span>
            <b>CHEGOU HOJE</b> · 18 novidades<span className="hidden lg:inline"> pra pronta entrega</span>. Comenta
            EU QUERO!
          </Bubble>
        </div>
        <div className="flex flex-col gap-2.5 text-sm font-bold">
          <div className="hidden gap-2 lg:flex">
            <IconeQuadrado icone={ImageIcon} className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
            <IconeQuadrado icone={Video} className="size-9 rounded-[10px] bg-canvas-100" iconClassName="size-[18px]" />
          </div>
          <p className="grid grid-cols-2 overflow-hidden rounded-[10px] border-[1.5px] border-volt-950 text-center">
            <span className="px-1 py-[9px]">
              <Duo celular="Postar agora" desktop="Agora" />
            </span>
            <span className="bg-volt-950 px-1 py-[9px] text-paper-0">
              <Duo celular="Agendar 08:00" desktop="08:00" />
            </span>
          </p>
          <p className="hidden justify-between lg:flex">
            <span>Grupos</span>
            <span className="tabular-nums">47 de 47</span>
          </p>
          <span className="hidden min-h-[42px] items-center justify-center rounded-full border-[1.5px] border-volt-950 bg-acid-500 px-3 lg:flex">
            Postar nos 47
          </span>
        </div>
      </div>
    </article>
  );
}

/** O grupo que lotou e o próximo que nasceu sozinho. Só isso: o grupo novo não copia foto nem regras. */
function CartaoGrupoCheio() {
  return (
    <article className={CARTAO_GRANDE}>
      <CabecalhoCartao icone={Users}>Grupo cheio nunca mais perde cliente.</CabecalhoCartao>
      <p className={TEXTO_CARTAO}>
        Quando um grupo chega no limite, a Girumo cria o próximo sozinha. O link sempre leva pra onde tem vaga.
      </p>
      <div className="flex flex-col gap-3 lg:rounded-[14px] lg:bg-canvas-100 lg:p-4">
        {GRUPOS.map((grupo) => (
          <div
            key={grupo.nome}
            // O nome nunca encolhe abaixo do próprio texto: quem cede espaço em tela estreita é a barra.
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm font-bold lg:grid-cols-[minmax(max-content,1fr)_minmax(0,150px)_92px] lg:text-[15px]"
          >
            <span className="min-w-0">{grupo.nome}</span>
            <span className={cn("text-right lg:order-last lg:font-extrabold", grupo.cheio && "text-danger-700")}>
              {grupo.estado}
            </span>
            <span aria-hidden className="col-span-2 h-2 overflow-hidden rounded-full bg-[#E5E3DB] lg:col-span-1">
              <span className={cn("block h-full rounded-full", grupo.cheio ? "w-full bg-danger-700" : "w-[3%] bg-volt-950")} />
            </span>
          </div>
        ))}
        <p className="hidden items-center gap-2.5 border-t border-line-200 pt-2.5 text-sm font-bold lg:flex">
          <LinkIcon aria-hidden strokeWidth={2.2} className="size-4 shrink-0" />
          link único → VIP Promoções #09
          <ChaveLigada className="ml-auto" />
        </p>
      </div>
    </article>
  );
}

export function PilotoRecursos() {
  return (
    <section aria-labelledby="piloto-recursos" className={cn("py-10 lg:py-24", FAIXA)}>
      <div className={cn(MIOLO, "flex flex-col gap-3.5 lg:gap-10")}>
        <h2 id="piloto-recursos" className={cn("text-[34px] lg:max-w-[900px] lg:text-[56px]", TITULO)}>
          O que você repete na mão, a Girumo faz sozinha.
        </h2>

        {/* Lado a lado só a partir de 1280: entre 1024 e 1279 a coluna da conversa ficaria com ~140 px. */}
        <div className="grid gap-3.5 lg:gap-5 xl:grid-cols-2">
          <CartaoMensagem />
          <CartaoGrupoCheio />
        </div>

        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          {RECURSOS.map((recurso) => (
            <li key={recurso.titulo} className={cn(CARTAO, "flex min-w-0 flex-col gap-2 p-3.5 lg:gap-2.5 lg:p-[22px]")}>
              <IconeQuadrado icone={recurso.icone} className="size-9 lg:size-11" iconClassName="size-[18px] lg:size-[22px]" />
              <h3 className="text-[15px] font-bold leading-snug lg:text-[19px] lg:font-extrabold">{recurso.titulo}</h3>
              <p className="hidden text-[15px] leading-normal text-slate-600 lg:block">{recurso.texto}</p>
            </li>
          ))}
        </ul>

        <BotaoVerFuncionando className="mt-1.5 w-full lg:mt-0 lg:w-auto lg:self-start" />
      </div>
    </section>
  );
}
