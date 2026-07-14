import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Compare } from "@/components/landing/v2/compare";
import { Faq, FAQ_ITEMS } from "@/components/landing/v2/faq";
import { Features } from "@/components/landing/v2/features";
import { LandingFx } from "@/components/landing/v2/landing-fx";
import { LpShowcase } from "@/components/landing/v2/lp-showcase";
import { Mechanism } from "@/components/landing/v2/mechanism";
import { Nav } from "@/components/landing/v2/nav";
import { PricingV2 } from "@/components/landing/v2/pricing";
import { BRAND, getPublicSiteUrl } from "@/lib/brand";

/* ============================== SEO ============================== */

const SITE_URL = getPublicSiteUrl();
const OG_TITLE = `${BRAND.name} | ${BRAND.tagline}`;
const OG_DESC = BRAND.description;

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
  name: BRAND.name,
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
  title: `${BRAND.name} | ${BRAND.tagline}`,
  description: OG_DESC,
  keywords: [
    "encher grupos de WhatsApp",
    "link para grupo de WhatsApp",
    "gestão de grupos de WhatsApp",
    "publicação em massa WhatsApp",
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
    siteName: BRAND.name,
    title: OG_TITLE,
    description: OG_DESC,
    images: [
      {
        url: BRAND.ogAsset,
        width: 1200,
        height: 630,
        alt: `${BRAND.name}. ${BRAND.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESC,
    images: [BRAND.ogAsset],
  },
};

/* ============================ conteúdo ============================ */

const SIGNUP_URL = "/signup";
const DEFAULT_WHATSAPP_MESSAGE = encodeURIComponent(`Olá! Quero saber mais sobre a ${BRAND.name}.`);
const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  `https://wa.me/5562998191314?text=${DEFAULT_WHATSAPP_MESSAGE}`;

const STEPS_STRIP = [
  ["Divulgue seu link", "A página de captação lota o grupo de revendedores. Quando lota, o próximo nasce sozinho."],
  ["Publique a novidade", "A grade nova chega a todos os grupos de uma vez, na hora certa."],
  ["Veja quem comprou", "Descubra de qual grupo e de qual anúncio veio cada pedido."],
] as const;

const CASE_STATS = [
  ["R$5k → R$350k", "por mês"],
  ["12.000", "revendedores"],
  ["50+", "grupos"],
  ["20 mil peças", "em evento de 2 dias"],
] as const;

export default function LandingPage() {
  return (
    <div className="lp-root min-h-[100dvh] overflow-x-clip bg-volt-950 font-body text-canvas-100 antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_FAQ) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SOFTWARE) }} />

      <div className="lp-grain" aria-hidden />
      <Nav signupUrl={SIGNUP_URL} />

      <section className="relative flex min-h-[100dvh] overflow-hidden bg-volt-950">
        <div className="pointer-events-none absolute right-[8%] top-[22%] hidden h-24 w-24 border border-volt-800 lg:block" aria-hidden />
        <div className="pointer-events-none absolute bottom-[14%] right-[15%] hidden h-5 w-40 bg-acid-500 lg:block" aria-hidden />

        <div className="relative mx-auto grid w-full max-w-[var(--content-max)] grid-cols-1 items-center px-4 pb-16 pt-24 md:px-8 lg:grid-cols-12">
          <div className="lg:col-span-11 xl:col-span-10">
            <span
              className="lp-hero-in inline-flex bg-acid-500 px-3 py-1.5 font-data text-[11px] uppercase tracking-[0.16em] text-volt-950"
              style={{ ["--d" as string]: "0.05s" }}
            >
              WhatsApp para atacado de moda
            </span>

            <h1
              className="lp-hero-in mt-6 max-w-6xl text-balance font-tech text-[clamp(2.7rem,7vw,5.2rem)] font-bold leading-[0.98] tracking-[-0.045em] text-paper-0"
              style={{ ["--d" as string]: "0.18s" }}
            >
              {BRAND.tagline}
            </h1>

            <p
              className="lp-hero-in mt-6 max-w-xl text-pretty text-base leading-relaxed text-canvas-100/72 sm:text-lg"
              style={{ ["--d" as string]: "0.34s" }}
            >
              {BRAND.description}
            </p>

            <div
              className="lp-hero-in mt-9 flex flex-col items-start gap-3 sm:flex-row"
              style={{ ["--d" as string]: "0.48s" }}
            >
              <a
                href={SIGNUP_URL}
                className="lp-btn inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-acid-500 px-7 py-3.5 text-base font-semibold text-volt-950 hover:brightness-95"
              >
                Começar agora <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={WHATSAPP_URL}
                className="lp-btn inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-paper-0/25 bg-volt-950 px-7 py-3.5 text-base font-medium text-paper-0 transition hover:border-paper-0/60"
              >
                <WhatsAppIcon className="h-4 w-4 text-acid-500" /> Falar no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Como funciona em 3 passos" className="relative bg-canvas-100 py-14 text-volt-950 sm:py-16">
        <div className="absolute -top-3 left-[8%] h-6 w-40 bg-acid-500" aria-hidden />
        <ol className="mx-auto grid max-w-[var(--content-max)] gap-8 px-4 md:px-8 lg:grid-cols-[1.25fr_0.9fr_0.9fr] lg:gap-10">
          {STEPS_STRIP.map(([title, body], index) => (
            <li key={title} className={index === 0 ? "lg:pr-10" : "border-l border-volt-950/15 pl-6"}>
              <p className="font-tech text-xl font-bold tracking-tight text-volt-950">{title}</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="mecanismo" className="relative bg-volt-950 py-20 sm:py-28">
        <div className="absolute -top-3 right-[10%] h-6 w-28 bg-paper-0" aria-hidden />
        <div className="mx-auto max-w-[var(--content-max)] px-4 md:px-8" data-reveal>
          <h2 className="max-w-3xl font-tech text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
            Do anúncio ao grupo cheio, <span className="text-canvas-100/50">com uma operação que continua girando.</span>
          </h2>
        </div>
        <div className="mt-4">
          <Mechanism />
        </div>
      </section>

      <section id="comparacao" className="relative border-t border-volt-800 bg-volt-900 py-20 sm:py-28">
        <div className="mx-auto max-w-[var(--content-max)] px-4 pb-10 md:px-8" data-reveal>
          <h2 className="max-w-3xl font-tech text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
            O manual custa caro. <span className="text-canvas-100/50">Você só não vê a fatura.</span>
          </h2>
        </div>
        <Compare />
      </section>

      <section id="recursos" className="relative border-t border-volt-800 bg-volt-950 py-20 sm:py-28">
        <div className="absolute -top-3 left-[12%] h-6 w-20 bg-acid-500" aria-hidden />
        <div className="mx-auto max-w-[var(--content-max)] px-4 md:px-8">
          <div className="max-w-3xl" data-reveal>
            <h2 className="font-tech text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
              Opere 100 grupos <span className="text-canvas-100/50">como se fosse um.</span>
            </h2>
          </div>
          <div className="mt-12">
            <Features />
          </div>
        </div>
      </section>

      <section id="modelos" className="relative border-t border-volt-800 bg-volt-900 py-20 sm:py-28">
        <div className="mx-auto max-w-[var(--content-max)] px-4 md:px-8" data-reveal>
          <LpShowcase publicSiteUrl={SITE_URL} />
        </div>
      </section>

      <section id="historia" className="relative border-t border-volt-800 bg-volt-950 py-20 sm:py-28">
        <div className="mx-auto grid max-w-[var(--content-max)] gap-12 px-4 md:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div data-reveal>
            <p className="font-data text-xs uppercase tracking-[0.16em] text-acid-500">história real</p>
            <h2 className="mt-5 font-tech text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
              A gente não vende teoria. <span className="text-canvas-100/50">Vende o que fez a nossa loja faturar.</span>
            </h2>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-canvas-100/70 sm:text-lg">
              A Mega Stock começou como um atacado de roupa infantil na região da 44, em Goiânia. Em pouco tempo,
              saímos de R$5 mil para R$350 mil por mês com um jeito de vender por grupos de WhatsApp que a gente foi
              lapidando no dia a dia. Chegamos a 12 mil revendedores em mais de 50 grupos. Num único evento de 2 dias,
              saíram mais de 20 mil peças. A Girumo ajuda a lotar seus grupos, organiza a operação e publica sua oferta
              sem repetir o trabalho. É a ferramenta que a gente construiu para dar conta de tudo isso. Agora ela é sua.
            </p>
          </div>

          <aside className="relative bg-canvas-100 p-8 text-volt-950 sm:p-10" data-reveal>
            <div className="absolute -right-4 -top-4 h-20 w-20 bg-acid-500" aria-hidden />
            <p className="relative font-data text-xs uppercase tracking-[0.16em] text-slate-600">produto nascido na operação</p>
            <p className="relative mt-6 font-tech text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Da rotina da Mega Stock para o atacado que vende em grupos.
            </p>
            <dl className="relative mt-10 grid gap-6 border-t border-volt-950/15 pt-6 sm:grid-cols-2">
              <div>
                <dt className="font-data text-[11px] uppercase tracking-[0.14em] text-slate-600">origem</dt>
                <dd className="mt-1 font-medium">Região da 44, Goiânia</dd>
              </div>
              <div>
                <dt className="font-data text-[11px] uppercase tracking-[0.14em] text-slate-600">operação</dt>
                <dd className="mt-1 font-medium">Atacado de roupa infantil</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-data text-[11px] uppercase tracking-[0.14em] text-slate-600">canal de venda</dt>
                <dd className="mt-1 font-medium">Grupos de WhatsApp</dd>
              </div>
            </dl>
          </aside>
        </div>

        <dl className="mx-auto mt-14 grid max-w-[var(--content-max)] grid-cols-2 gap-px px-4 md:px-8 sm:grid-cols-4" data-reveal-group>
          {CASE_STATS.map(([value, label]) => (
            <div key={label} className="bg-paper-0 px-5 py-7 text-center text-volt-950">
              <dt className="font-tech text-[clamp(1.5rem,3.5vw,2.4rem)] font-bold tracking-tight">{value}</dt>
              <dd className="font-data mt-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-600">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="planos" className="relative border-t border-volt-800 bg-volt-900 py-20 sm:py-28">
        <div className="relative mx-auto max-w-[var(--content-max)] px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center" data-reveal>
            <h2 className="font-tech text-[clamp(2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
              Comece pequeno, <span className="text-canvas-100/50">cresça sem trocar de ferramenta.</span>
            </h2>
            <p className="mt-5 text-canvas-100/65">
              A Mega Stock fez R$350 mil por mês com esse jeito de vender. O Growth custa menos que uma grade.
            </p>
          </div>
          <div className="mt-12" data-reveal>
            <PricingV2 signupUrl={SIGNUP_URL} whatsappUrl={WHATSAPP_URL} />
          </div>
          <p className="font-data mt-12 flex flex-wrap justify-center gap-x-7 gap-y-2 text-center text-[11px] uppercase tracking-[0.14em] text-canvas-100/55" data-reveal>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-acid-500" /> garantia de 30 dias</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-acid-500" /> sem fidelidade</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-acid-500" /> seus contatos são seus</span>
          </p>
        </div>
      </section>

      <section id="duvidas" className="border-t border-volt-800 bg-volt-950 py-20 sm:py-28">
        <div className="mx-auto grid max-w-[var(--content-max)] gap-12 px-4 md:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-reveal>
            <h2 className="font-tech text-[clamp(1.9rem,4.5vw,3.2rem)] font-bold leading-[1.05] tracking-tight text-paper-0">
              O que perguntam <span className="text-canvas-100/50">antes de começar.</span>
            </h2>
            <p className="mt-5 max-w-sm text-canvas-100/65">Não achou a sua? Chama no WhatsApp. Gente de verdade responde.</p>
            <a href={WHATSAPP_URL} className="mt-6 inline-flex items-center gap-2 text-sm text-paper-0 transition hover:text-acid-500">
              <WhatsAppIcon className="h-4 w-4 text-acid-500" /> Perguntar agora <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div data-reveal>
            <Faq />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-volt-800 bg-volt-950">
        <div className="pointer-events-none absolute -top-3 right-[12%] h-6 w-32 bg-acid-500" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-28 text-center sm:py-40" data-reveal>
          <h2 className="font-tech text-balance text-[clamp(2.3rem,6vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.03em] text-paper-0">
            Seu próximo grupo cheio
            <span className="block text-canvas-100/50">começa com um link.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-canvas-100/68">
            Conecte seu WhatsApp em 2 minutos, crie a primeira campanha e veja o fluxo trabalhar. Você tem 30 dias de garantia.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={SIGNUP_URL}
              className="lp-btn inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-acid-500 px-7 py-3.5 text-base font-semibold text-volt-950 hover:brightness-95"
            >
              Começar agora <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={WHATSAPP_URL}
              className="lp-btn inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-paper-0/25 bg-volt-950 px-7 py-3.5 text-base font-medium text-paper-0 transition hover:border-paper-0/60"
            >
              <WhatsAppIcon className="h-4 w-4 text-acid-500" /> Falar no WhatsApp
            </a>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-volt-800 bg-volt-950 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
        <Link
          href={SIGNUP_URL}
          className="lp-btn flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-acid-500 py-3 text-sm font-semibold text-volt-950"
        >
          Começar agora <ArrowRight className="h-4 w-4" />
        </Link>
        <a
          href={WHATSAPP_URL}
          aria-label="Falar no WhatsApp"
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border border-paper-0/25 text-acid-500 transition-transform active:scale-95"
        >
          <WhatsAppIcon className="h-5 w-5" />
        </a>
      </div>

      <footer className="border-t border-volt-800 bg-volt-950">
        <div className="mx-auto grid max-w-[var(--content-max)] gap-10 px-4 py-14 pb-28 md:px-8 sm:grid-cols-2 sm:pb-14 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo className="text-paper-0" />
            <p className="mt-3 max-w-xs text-sm text-canvas-100/55">{BRAND.description}</p>
          </div>
          <FooterCol title="Produto" links={[["Mecanismo", "#mecanismo"], ["Recursos", "#recursos"], ["Planos", "#planos"], ["Dúvidas", "#duvidas"]]} />
          <FooterCol title="Conta" links={[["Entrar", "/login"], ["Criar conta", SIGNUP_URL]]} />
          <FooterCol title="Legal" links={[["Termos de uso", "/termos"], ["Política de privacidade", "/privacidade"], ["WhatsApp", WHATSAPP_URL]]} />
        </div>
        <div className="border-t border-volt-800">
          <div className="mx-auto flex max-w-[var(--content-max)] flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-canvas-100/55 md:px-8 sm:flex-row">
            <span>© {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.</span>
            <span className="font-data uppercase tracking-[0.14em]">{BRAND.tagline}</span>
          </div>
        </div>
      </footer>

      <LandingFx />
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="font-data text-xs uppercase tracking-[0.14em] text-canvas-100/55">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-canvas-100/65 transition hover:text-paper-0">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
