import Image from "next/image";
import { CalendarCheck, Check, Clock, Link2, QrCode, ShieldCheck, Smartphone, Users, type LucideIcon } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";
import { IMG } from "@/components/home-shared/home-data";
import { APOIO, BotaoTeste, H2, MIOLO, TINTA, TOPO } from "@/components/home-vitrine/ui";
import { cn } from "@/lib/utils";

interface Numero {
  valor: string;
  texto: string;
  icone: LucideIcon;
}

const NUMEROS_CIMA: readonly Numero[] = [
  { valor: "1 link", texto: "pra todos os grupos da campanha", icone: Link2 },
  { valor: "1.024", texto: "pessoas por grupo, o máximo do WhatsApp", icone: Users },
  { valor: "2 celulares", texto: "conectados no Growth e no Operação", icone: Smartphone },
];

/* "Mais de 2h" e não "2 horas": o cron do aviso (/api/cron/emails, Job 3) roda de
   hora em hora das 8h às 20h, então à noite o e-mail sai na manhã seguinte. */
const NUMEROS_BAIXO: readonly Numero[] = [
  { valor: "7 dias", texto: "grátis pra testar tudo", icone: CalendarCheck },
  { valor: "0", texto: "mensagem no privado, em nenhum plano", icone: ShieldCheck },
  { valor: "Mais de 2h", texto: "desconectado e você recebe um e-mail de aviso", icone: Clock },
];

/** Posição de cada bolha no mapa: celular primeiro, `lg:` pro desktop. */
const CONEXOES = [
  { nome: "Grupos", pos: "left-[20%] top-[20%] lg:left-[12%] lg:top-[34%]" },
  { nome: "Comunidades", pos: "left-[16%] top-[62%] lg:left-[24%] lg:top-[74%]" },
  { nome: "Instagram", pos: "left-1/2 top-[12%] lg:left-[33%] lg:top-[24%]" },
  { nome: "Pixel da Meta", pos: "left-[80%] top-[20%] lg:left-[67%] lg:top-[24%]" },
  { nome: "Google Analytics", pos: "left-[78%] top-[84%] lg:left-[77%] lg:top-[72%]" },
  { nome: "Site próprio", pos: "left-[84%] top-[52%] lg:left-[89%] lg:top-[36%]" },
  { nome: "Domínio próprio", pos: "left-[44%] top-[88%] lg:left-[60%] lg:top-[80%]" },
] as const;

function Numeros({ itens }: { itens: readonly Numero[] }) {
  return (
    <ul className="grid gap-2.5 lg:grid-cols-3 lg:gap-3.5">
      {itens.map(({ valor, texto, icone: Icone }) => (
        <li key={valor} className="relative rounded-[18px] border border-[#E3EADF] bg-white py-[18px] pl-[22px] pr-16">
          <b className="block font-brand text-[22px] font-bold">{valor}</b>
          <span className="mt-1 block text-sm leading-[1.45] text-slate-600">{texto}</span>
          <Icone aria-hidden className="absolute right-5 top-5 size-6 text-cobalt-500" />
        </li>
      ))}
    </ul>
  );
}

/** "Conectada ao que a sua loja já usa": números em volta do mapa de conexões. */
export function VitrineConexoes() {
  return (
    <section aria-labelledby="conexoes-titulo" className={cn(TINTA, "py-[60px] lg:py-24")}>
      <div className={cn(MIOLO, TOPO)}>
        <h2 id="conexoes-titulo" className={H2}>
          Conectada ao que a sua loja já usa
        </h2>
        <div>
          <p className={APOIO}>
            Grupos e comunidades do WhatsApp, pixel, site e domínio próprio, e o Instagram como complemento: tudo
            entrando no mesmo painel.
          </p>
          <BotaoTeste />
        </div>
      </div>
      <div className={cn(MIOLO, "mt-[26px] grid gap-2.5 lg:mt-10 lg:gap-3.5")}>
        <Numeros itens={NUMEROS_CIMA} />
        <div className="relative h-[380px] overflow-hidden rounded-[20px] bg-cobalt-500 lg:h-80 lg:rounded-3xl">
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 grid size-[110px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-volt-950 shadow-[0_0_0_12px_rgba(255,255,255,.1),0_0_0_26px_rgba(255,255,255,.06)] lg:size-[150px] lg:shadow-[0_0_0_18px_rgba(255,255,255,.1),0_0_0_40px_rgba(255,255,255,.06)]"
          >
            <LogoSymbol className="size-[46px] text-acid-500 lg:size-16" />
          </span>
          <ul aria-label="O que se conecta à Girumo">
            {CONEXOES.map((conexao) => (
              <li
                key={conexao.nome}
                className={cn(
                  "absolute grid size-[84px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-cobalt-700 p-1.5 text-center text-[11.5px] font-bold leading-[1.2] text-white lg:size-28 lg:p-2.5 lg:text-[13.5px]",
                  conexao.pos,
                )}
              >
                {conexao.nome}
              </li>
            ))}
          </ul>
        </div>
        <Numeros itens={NUMEROS_BAIXO} />
      </div>
    </section>
  );
}

const SELO = "rounded-[22px] p-6 lg:min-h-[210px] lg:px-[30px] lg:pb-8 lg:pt-[30px]";
const SELO_TITULO = "mt-[22px] block font-brand text-[26px] font-extrabold tracking-[-.02em]";
const SELO_TEXTO = "mt-2 text-[15.5px] leading-normal";

/** Os três selos coloridos: teste, só grupo, cancelamento. */
export function VitrineSelos() {
  return (
    <section aria-labelledby="selos-titulo" className="py-[60px] lg:py-24">
      <div className={cn(MIOLO, TOPO)}>
        <h2 id="selos-titulo" className={H2}>
          Feita pra você testar com calma e decidir depois
        </h2>
        <div>
          <p className={APOIO}>Você vê funcionando na sua loja antes da primeira cobrança.</p>
          <BotaoTeste />
        </div>
      </div>
      <ul className={cn(MIOLO, "mt-[26px] grid gap-3 lg:mt-10 lg:grid-cols-3 lg:gap-4")}>
        <li className={cn(SELO, "bg-acid-500")}>
          <Check aria-hidden strokeWidth={2.4} className="size-[30px]" />
          <b className={SELO_TITULO}>7 dias grátis</b>
          <p className={SELO_TEXTO}>Você cadastra o cartão, e a cobrança só começa no 8º dia.</p>
        </li>
        <li className={cn(SELO, "bg-volt-950 text-white")}>
          <LogoSymbol className="size-[30px] text-acid-500" />
          <b className={SELO_TITULO}>Só posta em grupo</b>
          <p className={cn(SELO_TEXTO, "text-white/80")}>Nunca manda mensagem no privado, em nenhum plano.</p>
        </li>
        <li className={cn(SELO, "bg-[#E4F2E9]")}>
          <Check aria-hidden strokeWidth={2.4} className="size-[30px]" />
          <b className={SELO_TITULO}>Cancela quando quiser</b>
          <p className={SELO_TEXTO}>Em Configurações, sem multa e sem fidelidade.</p>
        </li>
      </ul>
    </section>
  );
}

const PASSO = "rounded-[22px] border border-[#E3EADF] bg-white px-3.5 pb-7 pt-3.5";
const ILUSTRACAO = "relative grid h-[230px] place-items-center overflow-hidden rounded-2xl bg-[#F4FAEA]";
const RECORTE = "h-auto w-[88%] rounded-xl shadow-[0_18px_40px_-20px_rgba(7,25,35,.4)]";
const TAGS = ["Bio", "Anúncio", "Story", "Balcão"] as const;

function RotuloPasso({ children }: { children: string }) {
  return (
    <span className="ml-3.5 mt-5 inline-flex h-[26px] items-center rounded-full border border-cobalt-500 px-[11px] text-xs font-semibold text-cobalt-500">
      {children}
    </span>
  );
}

function TextoPasso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <>
      <h3 className="mx-3.5 mt-3 font-brand text-xl font-bold">{titulo}</h3>
      <p className="mx-3.5 mt-2 text-[15px] leading-[1.55] text-slate-600">{texto}</p>
    </>
  );
}

/** Celular desenhado com o QR Code: ilustração, o texto do passo diz o que é. */
function IlustracaoQr() {
  return (
    <div aria-hidden className={ILUSTRACAO}>
      <div className="h-[200px] w-[150px] rounded-3xl bg-[#0D1E28] p-2.5 shadow-[0_18px_40px_-20px_rgba(7,25,35,.5)]">
        <div className="grid size-full place-items-center rounded-2xl bg-white">
          <QrCode strokeWidth={1.4} className="size-[100px] text-volt-950" />
        </div>
      </div>
    </div>
  );
}

/** Recorte do link da campanha com as quatro saídas dele embaixo. */
function IlustracaoLink() {
  return (
    <div className={ILUSTRACAO}>
      <Image
        src={IMG.linkRecorte.src}
        alt="Link da campanha, botão de QR code, 36 grupos e 4.894 pessoas"
        width={IMG.linkRecorte.width}
        height={IMG.linkRecorte.height}
        sizes="(min-width: 1024px) 380px, 88vw"
        className={cn(RECORTE, "mb-[46px]")}
      />
      <ul aria-hidden className="absolute inset-x-0 bottom-[22px] flex justify-center gap-1.5">
        {TAGS.map((tag) => (
          <li
            key={tag}
            className="flex h-7 items-center rounded-full border border-[#E3EADF] bg-white px-[11px] text-[12.5px] font-semibold"
          >
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Comece em três passos": QR Code, link e o primeiro post agendado. */
export function VitrinePassos() {
  return (
    <section aria-labelledby="passos-titulo" className={cn(TINTA, "py-[60px] lg:py-24")}>
      <h2 id="passos-titulo" className={cn(H2, "px-[18px] text-center")}>
        Comece em três passos
      </h2>
      <ol className={cn(MIOLO, "mt-[26px] grid gap-3 lg:mt-11 lg:grid-cols-3 lg:gap-4")}>
        <li className={PASSO}>
          <IlustracaoQr />
          <RotuloPasso>Primeiro passo</RotuloPasso>
          <TextoPasso
            titulo="Conecta o número"
            texto="Lê o QR Code com o WhatsApp de sempre, igual o WhatsApp Web. Sem chip novo."
          />
        </li>
        <li className={PASSO}>
          <IlustracaoLink />
          <RotuloPasso>Segundo passo</RotuloPasso>
          <TextoPasso titulo="Cola o link" texto="Um link só na bio, no anúncio e no story. O QR code vai pro balcão." />
        </li>
        <li className={PASSO}>
          <div className={ILUSTRACAO}>
            <Image
              src={IMG.agendarRecorte.src}
              alt="Botão Agendar e a prévia de como a oferta chega no celular"
              width={IMG.agendarRecorte.width}
              height={IMG.agendarRecorte.height}
              sizes="(min-width: 1024px) 380px, 88vw"
              className={RECORTE}
            />
          </div>
          <RotuloPasso>Terceiro passo</RotuloPasso>
          <TextoPasso
            titulo="Agenda o primeiro post"
            texto="Escreve, vê a prévia e marca a hora. Sai em todos os grupos sozinho."
          />
        </li>
      </ol>
    </section>
  );
}
