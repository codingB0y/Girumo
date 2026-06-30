import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  Library,
  Network,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  StarHalf,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";
import { FlowVisual } from "@/components/landing/flow-visual";
import { Reveal } from "@/components/landing/interactive";
import { ProductFrame } from "@/components/landing/product-frame";
import { Pricing } from "@/components/landing/pricing";
import { WhatsAppIcon } from "@/components/landing/icons";

export const metadata = {
  title: "HubFlow — Gerencie e venda em todos os seus grupos de WhatsApp",
  description:
    "Dispare texto, vídeo e áudio para todos os seus grupos de WhatsApp com um clique. Agende a semana, monitore tudo e crie grupos no automático.",
};

/* Ação primária = criar conta. Secundária = WhatsApp de vendas. */
const SIGNUP_URL = "/signup";
const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20HubFlow.";

/* ⚠️ DEPOIMENTOS FICTÍCIOS (placeholder de demonstração) — SUBSTITUIR por reais antes de publicar. */
const TESTIMONIALS = [
  {
    quote:
      "Eu perdia a manhã copiando a mesma oferta grupo por grupo. Agora é um clique e tá em todos. Sobrou tempo pra vender de verdade.",
    name: "Carla Menezes",
    store: "Atacado da Moda · Fortaleza–CE",
    rating: 4.5,
  },
  {
    quote:
      "Dobrei o faturamento sem aumentar equipe. Disparo pros 40 grupos de uma vez e a agenda da semana roda sozinha enquanto eu durmo.",
    name: "Rodrigo Albuquerque",
    store: "RA Importados · Curitiba–PR",
    rating: 5,
    highlight: true,
  },
  {
    quote:
      "Quando um grupo lota, ele já abre o próximo sozinho. Nunca mais perdi cliente por falta de vaga — e meu número nunca caiu.",
    name: "Patrícia Lima",
    store: "Bazar da Paty · Goiânia–GO",
    rating: 4.5,
  },
];

export default function LandingPage() {
  return (
    <div className="font-body min-h-screen bg-breu text-bruma antialiased">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-breu/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo wordmarkClassName="text-white" />
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#recursos" className="text-sm text-bruma/60 transition hover:text-white">
              Recursos
            </a>
            <a href="#planos" className="text-sm text-bruma/60 transition hover:text-white">
              Planos
            </a>
            <a href="#duvidas" className="text-sm text-bruma/60 transition hover:text-white">
              Dúvidas
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden text-sm text-bruma/60 transition hover:text-white sm:inline">
              Entrar
            </Link>
            <Cta href={SIGNUP_URL} size="sm">
              Criar conta
            </Cta>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="hf-grid-dark pointer-events-none absolute inset-0 opacity-70" />
        {/* eclipse — anel de luz íris atrás do conteúdo */}
        <div className="hf-eclipse hf-breathe pointer-events-none absolute left-1/2 top-[20rem] -z-0 h-[40rem] w-[40rem] -translate-x-1/2 sm:top-[19rem] sm:h-[52rem] sm:w-[52rem]" />
        <div className="pointer-events-none absolute left-1/2 top-[26rem] -z-0 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-iris/25 blur-[120px]" />

        <div className="relative mx-auto max-w-3xl px-5 pt-20 pb-10 text-center sm:pt-28">
          <span className="font-data inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-wider text-bruma/70 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-iris-claro" />
            Gestão de grupos no WhatsApp
          </span>
          <h1 className="font-display mx-auto mt-7 max-w-3xl text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-white sm:text-[4.5rem]">
            Todos os seus grupos.
            <br className="hidden sm:block" />{" "}
            <span className="hf-gradient-text">Um clique só.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-lg text-bruma/65">
            Dispare pra todos os grupos de uma vez, agende a semana e deixe o resto no automático.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={SIGNUP_URL} size="lg">
              Criar conta grátis
            </Cta>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.06]"
            >
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" /> Falar no WhatsApp
            </a>
          </div>
          <p className="font-data mt-7 text-xs uppercase tracking-wider text-bruma/40">
            Conecta em 2 min · Seu número · Seus contatos são seus
          </p>
        </div>

        {/* dashboard real com brilho, flutuando */}
        <div className="relative mx-auto max-w-5xl px-5 pb-20">
          <Reveal>
            <div className="dz-float">
              <ProductFrame
                src="/product/painel-home.png"
                alt="Painel HubFlow — visão do negócio"
                chrome="hubflow · painel"
                aspect="1207 / 669"
                className="hf-glow"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ MECANISMO (animação grupos → hub) — logo abaixo do herói pra impacto ============ */}
      <section className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]">
        <div className="hf-eclipse pointer-events-none absolute -right-40 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 opacity-40" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:py-28 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Eyebrow n="01">O mecanismo</Eyebrow>
            <h2 className="font-display max-w-md text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              Um maestro pra todos os grupos de WhatsApp.
            </h2>
            <p className="mt-5 max-w-md text-bruma/60">
              De um ponto só, o HubFlow dispara, agenda e monitora todos os grupos ao mesmo tempo. Quando um enche, outro nasce no <span className="hf-gradient-text font-semibold">automático</span>.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {["dispara", "agenda", "monitora", "cria no automático"].map((c) => (
                <span
                  key={c}
                  className="font-data inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-bruma/70"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
                  {c}
                </span>
              ))}
            </div>
          </div>
          <FlowVisual className="mx-auto w-full max-w-lg" />
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5">
          {[
            "1 clique = todos os grupos",
            "texto · vídeo · áudio",
            "agenda recorrente",
            "número protegido",
          ].map((t) => (
            <span key={t} className="font-data flex items-center gap-2 text-xs uppercase tracking-wider text-bruma/50">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ============ BENTO — recursos com telas reais ============ */}
      <section id="recursos" className="relative">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-xl text-center">
            <Eyebrow n="02" center>
              Na prática
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.8rem] sm:leading-[1.05]">
              Um fluxo que <span className="hf-gradient-text">simplesmente funciona.</span>
            </h2>
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-6">
            {/* Disparo + agenda (estreito) */}
            <Reveal className="lg:col-span-2">
              <BentoCard icon={Send} title="Disparo em massa" line="Texto, vídeo e áudio pra todos os grupos num clique.">
                <div className="flex flex-wrap gap-2">
                  {["Texto", "Vídeo", "Áudio", "Imagem"].map((c) => (
                    <span key={c} className="font-data rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-bruma/70">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="font-data mt-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-iris-claro/80">
                  <ArrowRight className="h-3.5 w-3.5" /> todos os grupos de uma vez
                </p>
              </BentoCard>
            </Reveal>

            {/* Multi-grupo (largo, tela real) */}
            <Reveal className="lg:col-span-4" delay={80}>
              <BentoCard icon={Network} title="Todos os grupos num painel" line="Veja membros, saúde da conversa e quem lotou — e dispare direto da lista.">
                <BentoShot src="/product/painel-grupos.png" alt="Painel multi-grupo do HubFlow" />
              </BentoCard>
            </Reveal>

            {/* Resultados (largo, tela real) */}
            <Reveal className="lg:col-span-4" delay={80}>
              <BentoCard icon={BarChart3} title="Resultados sem planilha" line="Funil real e receita por campanha, em português claro.">
                <BentoShot src="/product/painel-resultados.png" alt="Painel de resultados do HubFlow" />
              </BentoCard>
            </Reveal>

            {/* Automático (estreito) */}
            <Reveal className="lg:col-span-2" delay={160}>
              <BentoCard icon={Plus} title="No automático" line="O HubFlow toca a operação enquanto você vende.">
                <ul className="space-y-2">
                  {["Cria grupo quando enche", "Nome e foto em massa", "Monitora sozinho"].map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-bruma/70">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      {b}
                    </li>
                  ))}
                </ul>
              </BentoCard>
            </Reveal>
          </div>

          {/* faixa de extras enxuta */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <MiniCard icon={CalendarClock} title="Agenda semanal recorrente">
              Monte a rotina de ofertas uma vez. Ele envia sozinho, nos dias e horários certos.
            </MiniCard>
            <MiniCard icon={Library} title="Biblioteca de criativos e copy">
              Criativos e copies de oferta, promoção e reativação prontos pra disparar.
            </MiniCard>
          </div>
        </div>
      </section>

      {/* ============ PROVA (depoimentos) ============ */}
      <section className="relative overflow-hidden">
        <div className="hf-eclipse pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-25" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-xl text-center">
            <Eyebrow n="03" center>
              Quem botou método
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              Lojistas que pararam de tocar na mão.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={(i % 3) * 80}>
                <TestimonialCard t={t} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PLANOS ============ */}
      <section id="planos" className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]">
        <div className="hf-eclipse pointer-events-none absolute left-1/2 top-0 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 opacity-30" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-xl text-center">
            <Eyebrow n="04" center>
              Planos
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              Planos que crescem com você.
            </h2>
          </div>
          <div className="mt-12">
            <Pricing signupUrl={SIGNUP_URL} whatsappUrl={WHATSAPP_URL} />
          </div>
          <p className="font-data mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-center text-xs uppercase tracking-wider text-bruma/45">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Garantia de 30 dias
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" /> Sem fidelidade
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-400" /> Seus contatos são seus
            </span>
          </p>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="duvidas" className="relative">
        <div className="mx-auto max-w-3xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-xl text-center">
            <Eyebrow n="05" center>
              Dúvidas
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              O que costumam perguntar.
            </h2>
          </div>
          <div className="mt-12 space-y-3">
            {[
              ["Preciso trocar de número?", "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo."],
              ["É difícil de usar?", "Se você usa WhatsApp, usa o HubFlow. Tudo em português, com modelos prontos e suporte de gente."],
              ["Quantos grupos posso gerenciar?", "No Growth, grupos ilimitados — todos num painel só. E quando um enche, ele cria o próximo sozinho."],
              ["Meu número corre risco de bloqueio?", "O HubFlow envia num ritmo seguro (anti-ban) e com número mascarado pra reduzir o risco."],
              ["Meus contatos ficam comigo se eu cancelar?", "Sim. É o seu número, seus contatos são seus. Sem fidelidade, sem multa."],
            ].map(([q, a]) => (
              <details
                key={q}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 transition open:border-iris/30"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-white">
                  {q}
                  <span className="font-data shrink-0 text-iris-claro transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-bruma/60">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA FINAL (horizonte luminoso) ============ */}
      <section className="relative overflow-hidden border-t border-white/10">
        <div className="hf-horizon pointer-events-none absolute inset-x-0 bottom-0 top-0" />
        {/* arco do "planeta" */}
        <div className="pointer-events-none absolute left-1/2 top-[60%] h-[60rem] w-[120rem] -translate-x-1/2 rounded-[50%] border-t border-iris/40 bg-breu shadow-[0_-40px_120px_-20px_rgba(106,75,240,0.6)]" />
        <div className="relative mx-auto max-w-3xl px-5 pt-28 pb-40 text-center">
          <span className="font-data inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-wider text-bruma/70">
            <Sparkles className="h-3 w-3 text-iris-claro" /> Comece hoje
          </span>
          <h2 className="font-display mx-auto mt-7 max-w-2xl text-3xl font-extrabold tracking-[-0.04em] text-white sm:text-5xl">
            Pare de tocar os grupos na mão.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-bruma/65">
            Conecte em 2 minutos e dispare pra todos os seus grupos hoje mesmo.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={SIGNUP_URL} size="lg">
              Criar conta grátis
            </Cta>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.06]"
            >
              <WhatsAppIcon className="h-4 w-4 text-[#25D366]" /> Falar no WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* CTA fixo mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-white/10 bg-breu/95 p-3 backdrop-blur sm:hidden">
        <a
          href={SIGNUP_URL}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-iris py-3 text-sm font-medium text-white shadow-iris"
        >
          Criar conta <ArrowRight className="h-4 w-4" />
        </a>
        <a
          href={WHATSAPP_URL}
          aria-label="Falar no WhatsApp"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 text-[#25D366]"
        >
          <WhatsAppIcon className="h-5 w-5" />
        </a>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-breu">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 pb-28 sm:grid-cols-2 sm:pb-14 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo wordmarkClassName="text-white" />
            <p className="mt-3 max-w-xs text-sm text-bruma/50">
              Gerencie e venda em todos os seus grupos de WhatsApp — num clique só.
            </p>
          </div>
          <FooterCol title="Produto" links={[
            ["Recursos", "#recursos"],
            ["Planos", "#planos"],
            ["Dúvidas", "#duvidas"],
          ]} />
          <FooterCol title="Conta" links={[
            ["Entrar", "/login"],
            ["Criar conta", SIGNUP_URL],
          ]} />
          <FooterCol title="Contato" links={[
            ["WhatsApp", WHATSAPP_URL],
          ]} />
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-bruma/40 sm:flex-row">
            <span>© {new Date().getFullYear()} HubFlow. Todos os direitos reservados.</span>
            <span className="font-data uppercase tracking-wider">O fluxo que vende.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- primitivos ---------- */

function Cta({
  href,
  children,
  size = "md",
  className,
}: {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3.5 text-base",
  };
  return (
    <a
      href={href}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-xl bg-iris font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-breu",
        sizes[size],
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </a>
  );
}

function Eyebrow({
  n,
  children,
  center,
}: {
  n?: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <p
      className={cn(
        "font-data mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.2em] text-bruma/50",
        center && "justify-center",
      )}
    >
      {n && <span className="text-iris-claro">{n}</span>}
      <span className="h-px w-8 bg-current opacity-40" />
      {children}
    </p>
  );
}

function BentoCard({
  icon: Icon,
  title,
  line,
  children,
}: {
  icon: typeof Send;
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-iris/40 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
          <Icon className="h-5 w-5" />
        </span>
        <p className="font-display text-lg font-bold text-white">{title}</p>
      </div>
      <p className="mt-3 text-sm text-bruma/60">{line}</p>
      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}

/** Screenshot limpo (sem chrome) dentro de um card bento. */
function BentoShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-white/10 bg-breu-2">
      <Image src={src} alt={alt} fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 640px" />
    </div>
  );
}

function MiniCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Send;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-iris/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-display text-base font-bold text-white">{title}</p>
        <p className="mt-1 text-sm text-bruma/60">{children}</p>
      </div>
    </div>
  );
}

/** Estrelas com meia-estrela — nota de 0 a 5 (ex.: 4.5). */
function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} de 5 estrelas`}>
      <div className="flex gap-0.5 text-amber-400">
        {Array.from({ length: 5 }).map((_, i) => {
          if (i < full) return <Star key={i} className="h-4 w-4 fill-current" />;
          if (i === full && half) return <StarHalf key={i} className="h-4 w-4 fill-current" />;
          return <Star key={i} className="h-4 w-4 text-white/15" />;
        })}
      </div>
      <span className="font-data text-xs text-bruma/45">{rating.toFixed(1)}</span>
    </div>
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

function TestimonialCard({
  t,
}: {
  t: (typeof TESTIMONIALS)[number];
}) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col rounded-3xl border p-7 transition",
        t.highlight
          ? "border-iris/50 bg-iris/[0.07] shadow-iris hf-glow lg:-mt-4 lg:pb-9"
          : "border-white/10 bg-white/[0.03] hover:border-iris/40",
      )}
    >
      <Stars rating={t.rating} />
      <blockquote className="font-editorial mt-4 flex-1 text-xl italic leading-snug text-white">
        “{t.quote}”
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span
          className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-iris-claro to-iris-escuro text-sm font-bold text-white"
          aria-hidden
        >
          {initials(t.name)}
        </span>
        <div>
          <p className="text-sm font-medium text-white">{t.name}</p>
          <p className="font-data text-xs uppercase tracking-wider text-bruma/45">{t.store}</p>
        </div>
      </figcaption>
    </figure>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="font-data text-xs uppercase tracking-wider text-bruma/40">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-bruma/60 transition hover:text-white">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
