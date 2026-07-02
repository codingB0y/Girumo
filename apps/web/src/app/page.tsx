import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  LayoutTemplate,
  Library,
  Network,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Nav } from "@/components/landing/v2/nav";
import { FlowCanvas } from "@/components/landing/v2/flow-canvas";
import { LandingFx } from "@/components/landing/v2/landing-fx";
import { Mechanism } from "@/components/landing/v2/mechanism";
import { PricingV2 } from "@/components/landing/v2/pricing";
import { Faq, FAQ_ITEMS } from "@/components/landing/v2/faq";
import { GroupWall } from "@/components/landing/v2/group-wall";

/* ============================== SEO ============================== */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://hubflow.com.br";
const OG_TITLE = "HubFlow — Um link lota o grupo. Um clique posta em todos.";
const OG_DESC =
  "Campanhas de WhatsApp com link rastreado que enchem seus grupos no automático — e um painel com IA que agenda, posta e gerencia 100 grupos em 2 cliques.";

const JSON_LD_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

const JSON_LD_SOFTWARE = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "HubFlow",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: OG_DESC,
  url: SITE_URL,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: "197",
    highPrice: "497",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    ratingCount: "127",
  },
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "HubFlow — Encha seus grupos de WhatsApp no automático",
  description: OG_DESC,
  keywords: [
    "encher grupos de WhatsApp",
    "link para grupo de WhatsApp",
    "gestão de grupos de WhatsApp",
    "disparo em massa WhatsApp",
    "automação de WhatsApp",
    "agendar mensagens WhatsApp",
    "captação de leads WhatsApp",
    "vender no WhatsApp",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "HubFlow",
    title: OG_TITLE,
    description: OG_DESC,
    images: [
      {
        url: "/product/painel-home.png",
        width: 1207,
        height: 669,
        alt: "Painel HubFlow com grupos de WhatsApp, métricas de disparo e membros ativos",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESC,
    images: ["/product/painel-home.png"],
  },
};

/* ============================ conteúdo ============================ */

const SIGNUP_URL = "/signup";
const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20HubFlow.";

/** Depoimentos de clientes reais (coleta: formulário pós-onboarding / NPS > 8). */
const TESTIMONIALS = [
  {
    quote:
      "Eu perdia a manhã copiando a mesma oferta grupo por grupo. Agora é um clique e tá em todos. Sobrou tempo pra vender de verdade.",
    name: "Carla M.",
    store: "Atacado da Moda · Fortaleza–CE",
  },
  {
    quote:
      "Dobrei o faturamento sem aumentar equipe. Disparo pros 40 grupos de uma vez e a agenda da semana roda sozinha enquanto eu durmo.",
    name: "Rodrigo A.",
    store: "RA Importados · Curitiba–PR",
    highlight: true,
  },
  {
    quote:
      "Quando um grupo lota, ele já abre o próximo sozinho. Nunca mais perdi cliente por falta de vaga no grupo.",
    name: "Patrícia L.",
    store: "Bazar da Paty · Goiânia–GO",
  },
];

const TICKER_ITEMS = [
  "um link rastreado → grupo cheio",
  "100 grupos · 2 cliques",
  "1 configuração posta em todos",
  "calendário que roda sozinho",
  "copys e criativos que convertem",
  "lead rastreado do anúncio à venda",
  "grupo lotou → o próximo já nasce",
  "a IA configura por você",
];

export default function LandingPage() {
  return (
    <div className="lp-root font-body min-h-screen overflow-x-clip bg-void text-bruma antialiased">
      {/* JSON-LD structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SOFTWARE) }} />

      <div className="lp-grain" aria-hidden />
      <Nav signupUrl={SIGNUP_URL} />

      {/* ============ HERO — a experiência do fluxo ============ */}
      <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
        {/* fundo: glows CSS (sempre) + canvas do fluxo (desktop) */}
        <div className="lp-halo pointer-events-none absolute left-1/2 top-[-20%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-iris/20 blur-[140px]" aria-hidden />
        <div className="pointer-events-none absolute bottom-[-10%] left-[8%] h-[26rem] w-[26rem] rounded-full bg-zap/[0.07] blur-[120px]" aria-hidden />
        <FlowCanvas className="absolute inset-0 h-full w-full" />

        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 pb-28 pt-32 text-center">
          <span
            className="lp-hero-in font-data inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-bruma/60 backdrop-blur"
            style={{ ["--d" as string]: "0.05s" }}
          >
            <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-zap" />
            plataforma de grupos de WhatsApp
          </span>

          <h1
            className="lp-hero-in font-editorial mt-8 text-balance text-[clamp(2.9rem,9vw,7rem)] leading-[0.98] tracking-[-0.02em] text-white"
            style={{ ["--d" as string]: "0.18s" }}
          >
            Um link lota o grupo.
            <br />
            <em className="lp-grad">Um clique posta em todos.</em>
          </h1>

          <p
            className="lp-hero-in mx-auto mt-7 max-w-xl text-pretty text-base leading-relaxed text-bruma/60 sm:text-lg"
            style={{ ["--d" as string]: "0.34s" }}
          >
            Campanhas com link rastreado que enchem seus grupos no automático — e um painel com IA
            que agenda, posta e gerencia 100 grupos em 2 cliques.
          </p>

          <div
            className="lp-hero-in mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ ["--d" as string]: "0.48s" }}
          >
            <a
              href={SIGNUP_URL}
              data-magnetic
              className="lp-btn lp-btn-primary inline-flex items-center gap-2 rounded-2xl bg-iris px-8 py-4 text-base font-medium text-white"
            >
              Criar minha campanha grátis <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              data-magnetic
              className="lp-btn inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] px-8 py-4 text-base font-medium text-white backdrop-blur transition hover:border-white/30"
            >
              <WhatsAppIcon className="h-4 w-4 text-zap" /> Falar no WhatsApp
            </a>
          </div>

          <p
            className="lp-hero-in font-data mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.2em] text-bruma/40"
            style={{ ["--d" as string]: "0.62s" }}
          >
            <span>127 lojistas</span>
            <span className="text-iris-claro">·</span>
            <span>avaliação 4.9</span>
            <span className="text-iris-claro">·</span>
            <span>conecta em 2 min</span>
            <span className="text-iris-claro">·</span>
            <span>sem cartão</span>
          </p>
        </div>

        <a
          href="#mecanismo"
          aria-label="Descer para ver como funciona"
          className="lp-hero-in absolute bottom-7 left-1/2 -translate-x-1/2 text-bruma/35 transition hover:text-white"
          style={{ ["--d" as string]: "1s" }}
        >
          <ArrowDown className="h-5 w-5 animate-bounce" />
        </a>
      </section>

      {/* ============ TICKER ============ */}
      <section className="border-y border-white/[0.07] bg-white/[0.015] py-4" aria-hidden>
        <div className="lp-ticker-mask overflow-hidden">
          <div className="lp-ticker">
            {Array.from({ length: 2 }).map((_, dup) => (
              <div key={dup} className="flex shrink-0" aria-hidden={dup === 1}>
                {TICKER_ITEMS.map((t) => (
                  <span key={t} className="font-data flex items-center gap-3 whitespace-nowrap px-7 text-xs uppercase tracking-[0.2em] text-bruma/45">
                    <WhatsAppIcon className="h-3.5 w-3.5 shrink-0 text-zap/70" />
                    {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MECANISMO (scrollytelling) ============ */}
      <section id="mecanismo" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5" data-reveal>
          <p className="font-data text-xs uppercase tracking-[0.3em] text-iris-claro">o mecanismo</p>
          <h2 className="font-editorial mt-4 max-w-2xl text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.02] text-white">
            Do anúncio ao grupo cheio, <em className="lp-grad">sem tocar em nada.</em>
          </h2>
        </div>
        <div className="mt-6">
          <Mechanism />
        </div>
      </section>

      {/* ============ PAINEL — telas reais ============ */}
      <section id="painel" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="lp-halo pointer-events-none absolute right-[-15%] top-0 h-[34rem] w-[34rem] rounded-full bg-iris/15 blur-[140px]" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-5">
          <div className="max-w-2xl" data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-iris-claro">o painel</p>
            <h2 className="font-editorial mt-4 text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.02] text-white">
              Uma central que opera <em className="lp-grad">enquanto você vende.</em>
            </h2>
          </div>

          {/* tela principal com parallax */}
          <div className="relative mt-14" data-reveal>
            <div data-parallax="30">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-void-2 shadow-deep">
                <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-5 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="font-data ml-3 text-[11px] uppercase tracking-wider text-bruma/35">hubflow · painel</span>
                </div>
                <Image
                  src="/product/painel-home.png"
                  alt="Painel HubFlow — visão geral do negócio com métricas dos grupos"
                  width={1207}
                  height={669}
                  className="w-full"
                  sizes="(max-width: 1152px) 100vw, 1152px"
                />
              </div>
            </div>
          </div>

          {/* bento de recursos */}
          <div className="mt-6 grid gap-5 lg:grid-cols-6" data-reveal-group>
            <FeatureCard
              className="lg:col-span-4"
              icon={Network}
              title="100 grupos, 2 cliques"
              line="Todos os grupos num painel só: membros, saúde da conversa, quem lotou. Selecione todos e dispare texto, vídeo ou áudio de uma vez."
              shot={{ src: "/product/painel-grupos.png", alt: "Painel multi-grupo do HubFlow com lista de grupos e métricas" }}
            />
            <FeatureCard
              className="lg:col-span-2"
              icon={CalendarClock}
              title="Calendário que posta sozinho"
              line="Monte a semana uma vez. Uma configuração posta em todos os grupos, nos dias e horários certos — pra sempre."
            >
              <div className="mt-auto grid grid-cols-7 gap-1.5">
                {["s", "t", "q", "q", "s", "s", "d"].map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <span className="font-data text-[10px] uppercase text-bruma/35">{d}</span>
                    <span className={cn("h-8 w-full rounded-md border", [0, 2, 4].includes(i) ? "border-iris/40 bg-iris/15" : "border-white/[0.07] bg-white/[0.02]")} />
                  </div>
                ))}
              </div>
            </FeatureCard>
            <FeatureCard
              className="lg:col-span-2"
              icon={Library}
              title="Biblioteca que converte"
              line="Copys e criativos prontos pra grupo e pra anúncio — testados em quem vende todo dia. Copie, cole, fature."
            >
              <div className="mt-auto flex flex-wrap gap-2">
                {["oferta relâmpago", "reativação", "esquenta", "recuperação"].map((c) => (
                  <span key={c} className="font-data rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-bruma/60">
                    {c}
                  </span>
                ))}
              </div>
            </FeatureCard>
            <FeatureCard
              className="lg:col-span-4"
              icon={BarChart3}
              title="De onde vem cada venda"
              line="Cada lead chega rastreado: qual anúncio, qual story, qual bio. O painel mostra o canal que enche grupo e o que gera venda — alimentando seus anúncios com dados de verdade."
              shot={{ src: "/product/painel-resultados.png", alt: "Painel de resultados do HubFlow com funil e receita por campanha" }}
            />
            <FeatureCard
              className="lg:col-span-3"
              icon={LayoutTemplate}
              title="Landing pages com a sua marca"
              line="Modelos prontos de página de captação, personalizáveis do seu jeito. Publica no nosso domínio e o lead já entra no grupo rastreado."
            />
            <FeatureCard
              className="lg:col-span-3"
              icon={RefreshCcw}
              title="Funil de recuperação"
              line="Capta, retém, reativa e recupera clientes no automático. Quem sumiu recebe o convite certo na hora certa."
            />
          </div>
        </div>
      </section>

      {/* ============ PROVA ============ */}
      <section className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl" data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-iris-claro">quem já roda no fluxo</p>
            <h2 className="font-editorial mt-4 text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.02] text-white">
              Lojistas que pararam <em className="lp-grad">de tocar na mão.</em>
            </h2>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3" data-reveal-group>
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className={cn(
                  "lp-card flex h-full flex-col rounded-[1.75rem] border p-8",
                  t.highlight
                    ? "border-iris/40 bg-gradient-to-b from-iris/[0.12] to-white/[0.02]"
                    : "border-white/10 bg-white/[0.02]",
                )}
              >
                <span className="font-editorial text-5xl leading-none text-iris-claro/60" aria-hidden>“</span>
                <blockquote className="font-editorial mt-2 flex-1 text-2xl leading-snug text-white">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-8 flex items-center gap-3 border-t border-white/10 pt-5">
                  <span className="font-data flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-iris-claro to-iris-escuro text-xs font-medium text-white" aria-hidden>
                    {initials(t.name)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{t.name}</p>
                    <p className="font-data text-[11px] uppercase tracking-wider text-bruma/40">{t.store}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          <p className="font-data mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.2em] text-bruma/40" data-reveal>
            <span className="flex items-center gap-2">
              <span className="text-2xl font-medium normal-case tracking-normal text-white" data-counter="127">127</span> lojistas ativos
            </span>
            <span className="flex items-center gap-2">
              <span className="text-2xl font-medium normal-case tracking-normal text-white">4.9</span> avaliação média
            </span>
          </p>
        </div>
      </section>

      {/* ============ PLANOS ============ */}
      <section id="planos" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="lp-halo pointer-events-none absolute left-1/2 top-[-10%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-iris/15 blur-[150px]" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center" data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-iris-claro">planos</p>
            <h2 className="font-editorial mt-4 text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.02] text-white">
              Comece pequeno, <em className="lp-grad">cresça sem trocar de ferramenta.</em>
            </h2>
          </div>
          <div className="mt-12" data-reveal>
            <PricingV2 signupUrl={SIGNUP_URL} whatsappUrl={WHATSAPP_URL} />
          </div>
          <p className="font-data mt-10 flex flex-wrap justify-center gap-x-7 gap-y-2 text-center text-[11px] uppercase tracking-[0.2em] text-bruma/40" data-reveal>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-zap" /> garantia de 30 dias</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-zap" /> sem fidelidade</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-zap" /> seus contatos são seus</span>
          </p>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="duvidas" className="border-t border-white/[0.07] py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-iris-claro">dúvidas</p>
            <h2 className="font-editorial mt-4 text-[clamp(2.2rem,5vw,3.6rem)] leading-[1.02] text-white">
              O que perguntam <em className="lp-grad">antes de começar.</em>
            </h2>
            <p className="mt-5 max-w-sm text-bruma/55">
              Não achou a sua? Chama no WhatsApp — gente de verdade responde.
            </p>
            <a href={WHATSAPP_URL} className="mt-6 inline-flex items-center gap-2 text-sm text-white transition hover:text-iris-claro">
              <WhatsAppIcon className="h-4 w-4 text-zap" /> Perguntar agora <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div data-reveal>
            <Faq />
          </div>
        </div>
      </section>

      {/* ============ CTA FINAL — o muro de grupos ============ */}
      <section className="relative overflow-hidden border-t border-white/[0.07]">
        <GroupWall />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void via-transparent to-void" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 py-32 text-center sm:py-44">
          <h2 className="font-editorial text-balance text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.98] text-white" data-reveal>
            Seu próximo grupo cheio
            <br />
            <em className="lp-grad">começa com um link.</em>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-bruma/60" data-reveal>
            Conecte seu WhatsApp em 2 minutos, crie a primeira campanha e veja o fluxo trabalhar.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal>
            <a
              href={SIGNUP_URL}
              data-magnetic
              className="lp-btn lp-btn-primary inline-flex items-center gap-2 rounded-2xl bg-iris px-8 py-4 text-base font-medium text-white"
            >
              Teste 7 dias grátis <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              data-magnetic
              className="lp-btn inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-void/60 px-8 py-4 text-base font-medium text-white backdrop-blur transition hover:border-white/30"
            >
              <WhatsAppIcon className="h-4 w-4 text-zap" /> Falar no WhatsApp
            </a>
          </div>
          <p className="font-data mt-8 text-[11px] uppercase tracking-[0.25em] text-bruma/40" data-reveal>
            sem cartão · sem fidelidade · seus contatos são seus
          </p>
        </div>
      </section>

      {/* CTA fixo mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-white/10 bg-void/95 p-3 backdrop-blur sm:hidden">
        <Link
          href={SIGNUP_URL}
          className="lp-btn lp-btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl bg-iris py-3 text-sm font-medium text-white"
        >
          Começar grátis <ArrowRight className="h-4 w-4" />
        </Link>
        <a
          href={WHATSAPP_URL}
          aria-label="Falar no WhatsApp"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-zap transition-transform active:scale-95"
        >
          <WhatsAppIcon className="h-5 w-5" />
        </a>
      </div>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-white/[0.07] bg-void">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 pb-28 sm:grid-cols-2 sm:pb-14 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo wordmarkClassName="text-white" />
            <p className="mt-3 max-w-xs text-sm text-bruma/45">
              Campanhas que enchem grupos de WhatsApp e um painel que gerencia todos — num clique só.
            </p>
          </div>
          <FooterCol title="Produto" links={[["Mecanismo", "#mecanismo"], ["Painel", "#painel"], ["Planos", "#planos"], ["Dúvidas", "#duvidas"]]} />
          <FooterCol title="Conta" links={[["Entrar", "/login"], ["Criar conta", SIGNUP_URL]]} />
          <FooterCol title="Legal" links={[["Termos de uso", "/termos"], ["Política de privacidade", "/privacidade"], ["WhatsApp", WHATSAPP_URL]]} />
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-bruma/35 sm:flex-row">
            <span>© {new Date().getFullYear()} HubFlow. Todos os direitos reservados.</span>
            <span className="font-data uppercase tracking-[0.25em]">o fluxo que vende</span>
          </div>
        </div>
      </footer>

      <LandingFx />
    </div>
  );
}

/* ---------- primitivos ---------- */

function FeatureCard({
  icon: Icon,
  title,
  line,
  shot,
  children,
  className,
}: {
  icon: typeof Network;
  title: string;
  line: string;
  shot?: { src: string; alt: string };
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("lp-card flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.02] p-7", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-editorial text-2xl text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-bruma/55">{line}</p>
      {shot && (
        <div className="relative mt-6 aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-void-2">
          <Image src={shot.src} alt={shot.alt} fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 640px" />
        </div>
      )}
      {children && <div className="mt-6 flex flex-1 flex-col">{children}</div>}
    </article>
  );
}

/** Iniciais (2 letras) a partir do nome, pro avatar. */
function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="font-data text-xs uppercase tracking-[0.2em] text-bruma/35">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-bruma/55 transition hover:text-white">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
