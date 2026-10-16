import {
  CalendarCheck,
  Camera,
  ChartColumn,
  Clock,
  FileText,
  Globe,
  Link2,
  Megaphone,
  Pointer,
  QrCode,
  Send,
  ShieldCheck,
  Smartphone,
  Target,
  UserCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { IMG } from "@/components/home-shared/home-data";
import { Celular } from "@/components/home-shared/frames";
import { BotaoTeste, CINZA, H2, MIOLO } from "@/components/home-produto/ui";
import { cn } from "@/lib/utils";

const INTEGRACOES: ReadonlyArray<{ icone: LucideIcon; texto: string }> = [
  { icone: Users, texto: "Grupos de WhatsApp" },
  { icone: Megaphone, texto: "Comunidades e Avisos" },
  { icone: Camera, texto: "Instagram" },
  { icone: Target, texto: "Pixel da Meta" },
  { icone: ChartColumn, texto: "Google Analytics" },
  { icone: FileText, texto: "Site próprio" },
  { icone: Globe, texto: "Domínio próprio" },
];

/** Faixa fina de "funciona junto" logo abaixo do herói. */
export function ProdutoIntegracoes() {
  return (
    <section aria-labelledby="integracoes-titulo" className="border-y border-[#E2E7EA] py-6">
      <div className={cn(MIOLO, "flex flex-col items-start gap-3.5 lg:items-center")}>
        <h2 id="integracoes-titulo" className="text-sm text-slate-600">
          Funciona junto com o que a loja já usa
        </h2>
        <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-3 lg:flex lg:w-auto lg:flex-wrap lg:justify-center lg:gap-x-9">
          {INTEGRACOES.map(({ icone: Icone, texto }) => (
            <li key={texto} className="flex items-center gap-[9px] text-sm font-semibold text-[#3B4D56] lg:whitespace-nowrap lg:text-[15px]">
              <Icone aria-hidden className="size-5 shrink-0 text-cobalt-500" />
              {texto}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface Produto {
  selo: string;
  icone: LucideIcon;
  titulo: string;
  texto: string;
  rotulo: string;
  ficha: ReadonlyArray<readonly [legenda: string, valor: string]>;
  itens: ReadonlyArray<readonly [LucideIcon, string]>;
}

const PRODUTOS: readonly Produto[] = [
  {
    selo: "Todos os planos",
    icone: Link2,
    titulo: "Campanha com link único",
    texto: "Um link na bio, no anúncio e no story leva cada pessoa pro grupo com vaga.",
    // Total de grupos, como em PLANS ("Até 5 grupos gerenciados"), não por campanha.
    rotulo: "Grupos:",
    ficha: [
      ["Essencial", "até 5"],
      ["Growth", "sem limite"],
      ["Operação", "sem limite"],
    ],
    itens: [
      [Pointer, "Abre direto no app do WhatsApp"],
      [Users, "Uma pessoa, um grupo"],
      [Link2, "Lotou, o próximo nasce (Growth)"],
      [QrCode, "QR code pro balcão"],
      [Target, "Pixel da Meta no link"],
    ],
  },
  {
    selo: "Todos os planos",
    icone: Send,
    titulo: "Post em todos os grupos",
    texto: "Escreve uma vez, vê a prévia e posta agora ou na hora marcada.",
    rotulo: "Celulares conectados:",
    ficha: [
      ["Essencial", "1"],
      ["Growth", "2"],
      ["Operação", "2"],
    ],
    itens: [
      [Send, "Texto, foto e vídeo"],
      [Smartphone, "Prévia de como chega no celular"],
      [CalendarCheck, "Agenda dia e hora"],
      [Clock, "Agenda semanal em 1 clique (Growth)"],
      [ShieldCheck, "Ritmo seguro, sem configurar"],
    ],
  },
  {
    selo: "Ao vivo",
    icone: Zap,
    titulo: "Oferta relâmpago",
    texto: "Quem comenta EU QUERO primeiro leva. A fila se monta sozinha.",
    rotulo: "A oferta termina:",
    ficha: [
      ["quando dá", "a hora marcada"],
      ["ou quando", "acaba o estoque"],
    ],
    itens: [
      [Users, "Fila na ordem dos comentários"],
      [ChartColumn, "Placar ao vivo de quem pediu"],
      [Send, "Posta a oferta em todos os grupos"],
    ],
  },
  {
    selo: "Growth e Operação",
    icone: ChartColumn,
    titulo: "Venda com a origem",
    texto: "Anote a venda pelo telefone e veja se veio do anúncio, do story ou de qual grupo.",
    rotulo: "De onde veio a venda:",
    ficha: [
      ["veio do", "anúncio"],
      ["veio do", "story"],
      ["veio do", "grupo"],
    ],
    itens: [
      [ChartColumn, "Funil do anúncio até a compra"],
      [Target, "Custo de cada venda"],
      [Users, "Quem mais juntou gente"],
      [UserCheck, "Vendedora registra a venda"],
    ],
  },
];

/** Os quatro cartões de produto com a ficha por plano (ref. InfinitePay). */
export function ProdutoCartoes() {
  return (
    <section id="como" aria-labelledby="produtos-titulo" className={cn(CINZA, "scroll-mt-4 pb-[60px] pt-14 lg:pb-[92px] lg:pt-[84px]")}>
      <div className={MIOLO}>
        <h2 id="produtos-titulo" className={cn(H2, "text-center")}>
          Venda do jeito que a sua loja já vende:
          <br className="hidden lg:inline" /> no grupo, na bio e no anúncio
        </h2>
        <div className="mt-7 grid gap-3.5 lg:mt-11 lg:grid-cols-4 lg:gap-[18px]">
          {PRODUTOS.map(({ selo, icone: Icone, titulo, texto, rotulo, ficha, itens }) => (
            <article key={titulo} className="relative flex flex-col rounded-[18px] bg-white px-[22px] pb-6 pt-[26px]">
              <p className="absolute right-0 top-0 rounded-bl-xl rounded-tr-[18px] bg-[#E8EEFF] px-3 py-[7px] text-[11.5px] font-bold uppercase tracking-[.03em] text-cobalt-700">
                {selo}
              </p>
              <span aria-hidden className="mb-5 grid size-[52px] place-items-center rounded-[14px] bg-[#E8EEFF] text-cobalt-500">
                <Icone className="size-[26px]" />
              </span>
              <h3 className="font-brand text-[19px] font-bold leading-[1.25] tracking-[-.012em]">{titulo}</h3>
              <p className="mt-2 text-[14.5px] leading-normal text-slate-600 lg:min-h-[66px]">{texto}</p>
              <p className="mt-[18px] text-[13px] text-slate-600">{rotulo}</p>
              <dl className="mt-2 grid auto-cols-fr grid-flow-col gap-1.5">
                {ficha.map(([legenda, valor]) => (
                  <div key={legenda + valor} className="rounded-[10px] bg-[#F5F7F9] px-2.5 py-[9px]">
                    <dt className="text-[11.5px] text-slate-600">{legenda}</dt>
                    <dd className="mt-0.5 font-brand text-[15px] font-bold leading-[1.2] text-cobalt-700">{valor}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mb-[22px] mt-5 grid gap-2.5 text-sm leading-[1.35] text-[#2F434C]">
                {itens.map(([ItemIcone, item]) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <ItemIcone aria-hidden className="mt-px size-[17px] shrink-0 text-slate-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <BotaoTeste className="mt-auto h-11 px-5 text-[14.5px] lg:self-start" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Faixa escura com dois celulares inclinados: o painel funciona no navegador do celular. */
export function ProdutoNoBolso() {
  return (
    <section aria-labelledby="bolso-titulo" className="pt-14 lg:pt-[92px]">
      <div className={MIOLO}>
        <div className="grid overflow-hidden rounded-3xl bg-[#0B0F12] lg:h-[380px] lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 pt-[30px] text-white lg:px-14 lg:pt-0">
            <h2 id="bolso-titulo" className="max-w-[16em] font-brand text-[23px] font-semibold leading-[1.25] tracking-[-.018em] lg:text-[28px]">
              Seu painel no bolso: posta, acompanha os grupos e anota venda de onde estiver
            </h2>
            <p className="mt-3.5 text-[15px] text-white/75">Abre no navegador do celular e do computador, sem instalar nada.</p>
            <BotaoTeste escuro className="mt-6 h-[46px] lg:self-start" />
          </div>
          <div aria-hidden className="relative mt-[26px] h-[300px] lg:mt-0 lg:h-auto lg:bg-[#16252C]">
            <Celular
              img={IMG.inicioCelular}
              alt=""
              sizes="(min-width: 1024px) 212px, 168px"
              className="absolute left-[22px] top-6 z-[2] w-[168px] -rotate-6 lg:left-24 lg:top-[46px] lg:w-[212px]"
            />
            <Celular
              img={IMG.numerosCelular}
              alt=""
              sizes="(min-width: 1024px) 196px, 154px"
              className="absolute left-[176px] top-[46px] w-[154px] rotate-[5deg] lg:left-[316px] lg:top-[72px] lg:w-[196px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
