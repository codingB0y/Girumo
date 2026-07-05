import Link from "next/link";
import { ArrowDown, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/landing/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Nav } from "@/components/landing/v2/nav";
import { FlowCanvas } from "@/components/landing/v2/flow-canvas";
import { LandingFx } from "@/components/landing/v2/landing-fx";
import { Mechanism } from "@/components/landing/v2/mechanism";
import { Compare } from "@/components/landing/v2/compare";
import { Features } from "@/components/landing/v2/features";
import { LpShowcase } from "@/components/landing/v2/lp-showcase";
import { PricingV2 } from "@/components/landing/v2/pricing";
import { Faq, FAQ_ITEMS } from "@/components/landing/v2/faq";
import { GroupWall } from "@/components/landing/v2/group-wall";

/* ============================== SEO ============================== */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://hubflow.com.br";
const OG_TITLE = "HubFlow — Grupos cheios. Sua oferta em todos. Num clique.";
const OG_DESC =
  "A página pronta que enche seu grupo de WhatsApp, copys e criativos de biblioteca — e um clique que publica sua oferta em todos os grupos, com cada venda rastreada até a origem.";

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
    "landing page para grupo de WhatsApp",
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

const TICKER_ITEMS = [
  "um link rastreado → grupo cheio",
  "grupo lotou → o próximo nasce sozinho",
  "1 oferta → todos os grupos",
  "biblioteca de copys e criativos",
  "modelos de página de captação",
  "tracking do anúncio à venda",
  "agendou → postou",
  "100 grupos · 2 cliques",
];

const STEPS_STRIP = [
  ["01", "Divulgue seu link", "A página de captação lota o grupo de revendedores — e quando lota, o próximo nasce sozinho."],
  ["02", "Poste a novidade", "A grade nova em todos os grupos de uma vez, na hora certa."],
  ["03", "Veja quem comprou", "De qual grupo e de qual anúncio veio cada pedido."],
] as const;

const CASE_STATS = [
  ["R$5k → R$350k", "por mês"],
  ["12.000", "revendedores"],
  ["50+", "grupos"],
  ["20 mil peças", "em evento de 2 dias"],
] as const;

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
        <div className="lp-halo pointer-events-none absolute left-1/2 top-[-22%] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-[#96a0d6]/[0.09] blur-[140px]" aria-hidden />
        <div className="pointer-events-none absolute bottom-[-10%] left-[10%] h-[24rem] w-[24rem] rounded-full bg-zap/[0.06] blur-[120px]" aria-hidden />
        <FlowCanvas className="absolute inset-0 h-full w-full" />

        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 pb-28 pt-32 text-center">
          <span
            className="lp-hero-in font-data inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-bruma/60 backdrop-blur"
            style={{ ["--d" as string]: "0.05s" }}
          >
            <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-zap" />
            grupos de WhatsApp pra atacado de roupa
          </span>

          <h1
            className="lp-hero-in font-tech mt-8 text-balance text-[clamp(2.5rem,7vw,5.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-white"
            style={{ ["--d" as string]: "0.18s" }}
          >
            Encha seus grupos de revendedor.
            <br />
            <span className="text-bruma/40">Poste em todos. Venda todo dia.</span>
          </h1>

          <p
            className="lp-hero-in mx-auto mt-7 max-w-xl text-pretty text-base leading-relaxed text-bruma/60 sm:text-lg"
            style={{ ["--d" as string]: "0.34s" }}
          >
            O HubFlow lota seus grupos de WhatsApp com revendedores, publica sua oferta em todos de
            uma vez e mostra de qual grupo veio cada venda. Feito por quem levou um atacado de roupa
            de R$5 mil a R$350 mil por mês fazendo exatamente isso.
          </p>

          <div
            className="lp-hero-in mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ ["--d" as string]: "0.48s" }}
          >
            <a
              href={SIGNUP_URL}
              data-magnetic
              className="lp-btn lp-btn-light inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold"
            >
              Criar minha campanha <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              data-magnetic
              className="lp-btn inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] px-8 py-4 text-base font-medium text-white backdrop-blur transition hover:border-white/35"
            >
              <WhatsAppIcon className="h-4 w-4 text-zap" /> Falar no WhatsApp
            </a>
          </div>

          <p
            className="lp-hero-in font-data mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.2em] text-bruma/40"
            style={{ ["--d" as string]: "0.62s" }}
          >
            <span>feito por atacadista</span>
            <span className="text-bruma/25">·</span>
            <span>conecta em 2 min</span>
            <span className="text-bruma/25">·</span>
            <span>30 dias de garantia</span>
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

      {/* ============ 3 PASSOS ============ */}
      <section aria-label="Como funciona em 3 passos" className="relative py-12 sm:py-14">
        <ol className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-3 sm:gap-6">
          {STEPS_STRIP.map(([n, title, body]) => (
            <li key={n} className="flex gap-4">
              <span className="font-data pt-1 text-sm text-zap" aria-hidden>{n}</span>
              <div>
                <p className="font-tech text-lg font-bold tracking-tight text-white">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-bruma/55">{body}</p>
              </div>
            </li>
          ))}
        </ol>
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
          <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">o mecanismo</p>
          <h2 className="font-tech mt-4 max-w-2xl text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-white">
            Do anúncio ao grupo cheio, <span className="text-bruma/45">sem tocar em nada.</span>
          </h2>
        </div>
        <div className="mt-6">
          <Mechanism />
        </div>
      </section>

      {/* ============ COMPARAÇÃO + CALCULADORA ============ */}
      <section id="comparacao" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5 pb-12" data-reveal>
          <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">antes × depois</p>
          <h2 className="font-tech mt-4 max-w-2xl text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-white">
            O manual custa caro. <span className="text-bruma/45">Você só não vê a fatura.</span>
          </h2>
        </div>
        <Compare />
      </section>

      {/* ============ RECURSOS (mock-UIs, sem prints) ============ */}
      <section id="recursos" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-2xl" data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">recursos</p>
            <h2 className="font-tech mt-4 text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-white">
              Opere 100 grupos <span className="text-bruma/45">como se fosse um.</span>
            </h2>
          </div>
          <div className="mt-14">
            <Features />
          </div>
        </div>
      </section>

      {/* ============ LANDING PAGES DE CAPTAÇÃO ============ */}
      <section id="modelos" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5" data-reveal>
          <LpShowcase />
        </div>
      </section>

      {/* ============ CASE MEGA STOCK — prova central ============ */}
      <section id="historia" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-3xl" data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">história real</p>
            <h2 className="font-tech mt-4 text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-white">
              A gente não vende teoria. <span className="text-bruma/45">Vende o que fez a nossa loja faturar.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-bruma/60 sm:text-lg">
              A Mega Stock começou como um atacado de roupa infantil na região da 44, em Goiânia. Em
              pouco tempo, saímos de R$5 mil para R$350 mil por mês — com um jeito de vender por grupos
              de WhatsApp que a gente foi lapidando no dia a dia. Chegamos a 12 mil revendedores em mais
              de 50 grupos. Num único evento de 2 dias, saíram mais de 20 mil peças. O HubFlow é a
              ferramenta que a gente construiu pra dar conta de tudo isso — e agora ela é sua.
            </p>
          </div>
          <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] sm:grid-cols-4" data-reveal-group>
            {CASE_STATS.map(([value, label]) => (
              <div key={label} className="bg-void px-5 py-7 text-center">
                <dt className="font-tech text-[clamp(1.5rem,3.5vw,2.4rem)] font-bold tracking-tight text-white">{value}</dt>
                <dd className="font-data mt-1.5 text-[11px] uppercase tracking-[0.18em] text-bruma/45">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ============ PLANOS ============ */}
      <section id="planos" className="relative border-t border-white/[0.07] py-24 sm:py-32">
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center" data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">planos</p>
            <h2 className="font-tech mt-4 text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-white">
              Comece pequeno, <span className="text-bruma/45">cresça sem trocar de ferramenta.</span>
            </h2>
            <p className="mt-5 text-bruma/55">
              A Mega Stock fez R$350 mil por mês com esse jeito de vender. O Growth custa menos que uma grade.
            </p>
          </div>
          <div className="mt-12" data-reveal>
            <PricingV2 signupUrl={SIGNUP_URL} whatsappUrl={WHATSAPP_URL} />
          </div>
          <p className="font-data mt-12 flex flex-wrap justify-center gap-x-7 gap-y-2 text-center text-[11px] uppercase tracking-[0.2em] text-bruma/40" data-reveal>
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
            <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/40">dúvidas</p>
            <h2 className="font-tech mt-4 text-[clamp(1.9rem,4.5vw,3.2rem)] font-bold leading-[1.05] tracking-tight text-white">
              O que perguntam <span className="text-bruma/45">antes de começar.</span>
            </h2>
            <p className="mt-5 max-w-sm text-bruma/55">
              Não achou a sua? Chama no WhatsApp — gente de verdade responde.
            </p>
            <a href={WHATSAPP_URL} className="mt-6 inline-flex items-center gap-2 text-sm text-white transition hover:text-zap">
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
          <h2 className="font-tech text-balance text-[clamp(2.3rem,6vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.03em] text-white" data-reveal>
            Seu próximo grupo cheio
            <br />
            <span className="text-bruma/45">começa com um link.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-bruma/60" data-reveal>
            Conecte seu WhatsApp em 2 minutos, crie a primeira campanha e veja o fluxo trabalhar.
            30 dias de garantia — usou e não curtiu, devolvemos tudo.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row" data-reveal>
            <a
              href={SIGNUP_URL}
              data-magnetic
              className="lp-btn lp-btn-light inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-semibold"
            >
              Começar agora <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              data-magnetic
              className="lp-btn inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-void/60 px-8 py-4 text-base font-medium text-white backdrop-blur transition hover:border-white/35"
            >
              <WhatsAppIcon className="h-4 w-4 text-zap" /> Falar no WhatsApp
            </a>
          </div>
          <p className="font-data mt-8 text-[11px] uppercase tracking-[0.25em] text-bruma/40" data-reveal>
            30 dias de garantia · sem fidelidade · seus contatos são seus
          </p>
        </div>
      </section>

      {/* CTA fixo mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-white/10 bg-void/95 p-3 backdrop-blur sm:hidden">
        <Link
          href={SIGNUP_URL}
          className="lp-btn lp-btn-light flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
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
          <FooterCol title="Produto" links={[["Mecanismo", "#mecanismo"], ["Recursos", "#recursos"], ["Planos", "#planos"], ["Dúvidas", "#duvidas"]]} />
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
