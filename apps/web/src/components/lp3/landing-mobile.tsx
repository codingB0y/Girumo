import type { ReactNode } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { HeroDemo } from "@/components/lp3/hero-demo";
import { BazarVideo } from "@/components/lp3/video-facade";
import { WhatsAppIcon } from "@/components/landing/icons";
import { WHATSAPP_URL } from "@/components/lp3/landing-data";

/* Experiência mobile (< md), referência v2a do handoff.
   A ordem é de conversão: promessa → demo → prova → um dia de venda → preço.
   O painel denso de 960px do desktop não cabe aqui — vira a demo interativa.
   A seção de planos (com ciclo mensal/anual) vive em plans.tsx. */

const PEDIDOS = [
  ["Marina S.", "R$ 186", "anúncio"],
  ["Cleide R.", "R$ 342", "vip 12"],
  ["Ana Paula", "R$ 518", "story"],
] as const;

export function MobileHero() {
  return (
    <section className="lp4-mesh px-5 pb-10 pt-28">
      <p data-lp4-hi className="lp4-mono inline-flex items-center gap-2 text-[9px] text-[var(--body)]">
        <span className="lp4-pulse h-[5px] w-[5px] rounded-full bg-[var(--green)]" aria-hidden />
        whatsapp pra atacado de roupa
      </p>

      {/* O H1 carrega o termo de busca ("encher grupos de WhatsApp", já nas
          keywords da home). A promessa antiga — "Grupo cheio, venda todo dia" —
          não virou linha separada porque este H1 termina com as mesmas
          palavras: repeti-la logo abaixo seria eco, não apoio. O verde segue no
          fecho, preservando a cadência. */}
      <h1 data-lp4-split className="lp4-x mt-[18px] text-balance text-[40px]">
        Encha seus grupos de WhatsApp e <span className="lp4-green">venda todo dia.</span>
      </h1>

      <p data-lp4-hi className="mt-4 text-pretty text-base leading-[1.55] text-[var(--body)]">
        A Girumo enche seus grupos de revendedores, posta a grade em todos de uma vez e mostra de
        onde veio cada pedido.
      </p>

      {/* id usado pelo MobileCta pra saber quando revelar a barra fixa */}
      <a
        id="hero-cta"
        href={WHATSAPP_URL}
        data-outbound="whatsapp_click"
        data-lp4-hi
        className="lp4-btn lp4-btn-green mt-6 w-full justify-center py-[17px]"
      >
        <WhatsAppIcon className="h-4 w-4" aria-hidden /> Falar no WhatsApp
      </a>

      <p data-lp4-hi className="lp4-mono mt-3 text-center text-[9px] text-[var(--body)]">
        sem fidelidade · sem chip novo
      </p>

      <div data-lp4-hi>
        <HeroDemo />
      </div>
    </section>
  );
}

export function MobileStory() {
  return (
    <section className="px-5 py-12">
      <p data-lp4-r className="lp4-mono text-[9px] text-[var(--body)]">
        goiânia · região da 44 · história real
      </p>
      <h2 data-lp4-r className="lp4-x mt-3.5 text-[32px] leading-[1.02]">
        De R$ 5 mil a <span className="lp4-green">R$ 350 mil</span> por mês.
      </h2>
      <p data-lp4-r className="mt-3.5 text-sm leading-relaxed text-[var(--body)]">
        Atacado infantil na 44, tudo na mão até cansar. A virada foi o grupo de WhatsApp virar canal
        de venda. A Girumo é essa operação virando produto.
      </p>

      <figure
        data-lp4-photo
        className="relative mt-5 aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--line)]"
      >
        <Image
          src="/lp3/team-b.webp"
          alt="Time completo da Mega Stock reunido no galpão durante treinamento"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <figcaption className="lp4-mono absolute bottom-2.5 left-2.5 rounded-full bg-[rgba(7,17,20,0.72)] px-2.5 py-1 text-[7px] text-[var(--display)] backdrop-blur">
          o time da mega stock
        </figcaption>
      </figure>

      <div data-lp4-r className="mt-3.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-[18px]">
        <p className="text-[13px] font-bold">
          Mais de 50 grupos, <span className="lp4-green">no WhatsApp de verdade.</span>
        </p>
        <p className="lp4-mono mt-1.5 text-[8px] text-[var(--body)]">
          print real · “mega stock goiânia #51”
        </p>
        <div className="mt-3.5 flex justify-center gap-3">
          {[
            ["/lp3/grp-1.webp", "Lista de grupos Mega Stock Atacado no WhatsApp"],
            ["/lp3/grp-2.webp", "Grupos Mega Stock Goiânia numerados até 51"],
          ].map(([src, alt]) => (
            <figure
              key={src}
              data-lp4-photo
              className="relative aspect-[76/165] w-[150px] shrink-0 overflow-hidden rounded-[14px] border border-[var(--hairline)] shadow-[0_24px_50px_-24px_rgba(0,0,0,0.8)]"
            >
              <Image src={src} alt={alt} fill className="object-cover object-top" sizes="150px" />
            </figure>
          ))}
        </div>
      </div>

      <div data-lp4-r className="mt-3.5">
        <BazarVideo
          className="aspect-[4/5]"
          compact
          description="Loja cheia, fila na porta — 20 mil peças em 48h, avisado só nos grupos."
        />
      </div>
    </section>
  );
}

/** Um nó da linha do tempo: horário volt + o que acontece + o card do momento. */
function TimelineStep({
  time,
  label,
  children,
}: {
  time: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div data-lp4-r className="relative">
      <span
        className="absolute -left-[25px] top-1 h-[9px] w-[9px] rounded-full bg-[var(--green)] shadow-[0_0_0_4px_rgba(167,255,47,0.2)]"
        aria-hidden
      />
      <p className="lp4-x mb-2 text-[22px] text-[var(--green)]">
        {time} <span className="text-base text-[var(--display)]">· {label}</span>
      </p>
      {children}
    </div>
  );
}

const CARD = "rounded-[14px] border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3.5";

export function MobileTimeline() {
  return (
    <section className="border-t border-[var(--line)] px-5 py-12">
      <p data-lp4-r className="lp4-mono text-[9px] text-[var(--body)]">
        um dia de venda com a girumo
      </p>
      <h2 data-lp4-r className="lp4-x mt-3.5 text-[32px] leading-[1.02]">
        Do link ao pedido, <span className="text-[var(--body)]">sem tocar em nada.</span>
      </h2>

      <div className="mt-7 flex flex-col gap-8 border-l border-[rgba(167,255,47,0.35)] pl-5">
        <TimelineStep time="05h58" label="a grade chega">
          <div className={CARD}>
            <p className="text-[13px] leading-relaxed">Grade nova 214 — 40 peças. Manda “EU QUERO”.</p>
            <p className="lp4-mono mt-2 text-[8px] text-[var(--body)]">agendado pra 06h00 · 47 grupos</p>
          </div>
        </TimelineStep>

        <TimelineStep time="06h12" label="link no ar">
          <div className={`${CARD} flex items-center justify-between gap-3`}>
            <span className="text-[12.5px] font-semibold">girumo.app/sualoja</span>
            <span className="lp4-mono text-[8px] text-[var(--body)]">restam 43 vagas</span>
          </div>
        </TimelineStep>

        <TimelineStep time="07h04" label="grupo lotado">
          <div className={CARD}>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold">VIP 04 · Infantil</span>
              <span className="lp4-mono text-[9px] text-[#f5b43c]">100%</span>
            </div>
            <span
              className="mt-2 block h-[5px] rounded-full bg-[rgba(242,241,234,0.08)]"
              aria-hidden
            >
              <span className="block h-full w-full rounded-full bg-[#f5b43c]" />
            </span>
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--green)]">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> VIP 05 criado sozinho — link vivo
            </p>
          </div>
        </TimelineStep>

        <TimelineStep time="08h30" label="pedidos no painel">
          <div className="flex flex-col gap-1.5 rounded-[14px] border border-[var(--line)] bg-[var(--bg-2)] p-2.5">
            {PEDIDOS.map(([nome, valor, origem]) => (
              <div
                key={nome}
                className="flex items-center justify-between rounded-[10px] border border-[var(--line)] px-3 py-2"
              >
                <span className="text-xs font-semibold">{nome}</span>
                <span className="lp4-mono text-[9px] text-[var(--green)]">{valor}</span>
                <span className="lp4-mono text-[8px] text-[var(--body)]">{origem}</span>
              </div>
            ))}
          </div>
        </TimelineStep>
      </div>

      <h3 data-lp4-r className="lp4-x mt-8 text-balance text-[26px] leading-[1.05]">
        Isso, todo dia, <span className="lp4-green">no automático.</span>
      </h3>
      <a
        href={WHATSAPP_URL}
        data-outbound="whatsapp_click"
        data-lp4-r
        className="lp4-btn lp4-btn-green mt-4 w-full justify-center py-[15px] text-sm"
      >
        <WhatsAppIcon className="h-[15px] w-[15px]" aria-hidden /> Falar no WhatsApp
      </a>
    </section>
  );
}

export function MobileFecho() {
  return (
    <section className="bg-[var(--green)] px-5 pb-[60px] pt-14 text-center text-[var(--ink)]">
      <p className="lp4-mono text-[9px] text-[rgba(7,25,35,0.65)]">direito garantido por lei</p>
      <h2 className="lp4-x mt-3.5 text-balance text-[40px]">7 dias pra desistir. Sem multa nunca.</h2>
      <p className="mx-auto mt-3.5 max-w-[300px] text-sm leading-[1.55] text-[rgba(7,25,35,0.75)]">
        Conecte seu WhatsApp em 2 minutos. Desistiu em 7 dias, devolvemos tudo — e os grupos continuam seus.
      </p>
      <a
        href={WHATSAPP_URL}
        data-outbound="whatsapp_click"
        className="lp4-btn mt-6 bg-[var(--ink)] px-8 py-[17px] text-[15px] text-[var(--green)] shadow-[0_20px_50px_-20px_rgba(7,25,35,0.6)]"
      >
        <WhatsAppIcon className="h-[15px] w-[15px]" aria-hidden /> Falar no WhatsApp
      </a>
      <p className="lp4-mono mt-4 text-[8px] text-[rgba(7,25,35,0.6)]">
        sem fidelidade · cancele quando quiser
      </p>
    </section>
  );
}
