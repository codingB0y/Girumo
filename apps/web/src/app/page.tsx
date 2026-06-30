import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  Images,
  Library,
  MessageCircle,
  Network,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";
import { FlowVisual } from "@/components/landing/flow-visual";
import { Counter, Reveal } from "@/components/landing/interactive";
import { ProductFrame } from "@/components/landing/product-frame";
import { Pricing } from "@/components/landing/pricing";

export const metadata = {
  title: "HubFlow — Gerencie e venda em todos os seus grupos de WhatsApp",
  description:
    "Dispare texto, vídeo e áudio para todos os seus grupos de WhatsApp com um clique. Agende a semana, monitore tudo e crie grupos no automático. Conecta em 2 minutos, no seu número.",
};

/* Ação primária = criar conta. Secundária = WhatsApp de vendas. */
const SIGNUP_URL = "/signup";
const WHATSAPP_URL = process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL || "/signup";

/* ⚠️ PROVA REAL — SUBSTITUIR antes de publicar. Valores em [colchetes] são placeholders. */
const PROOF = {
  quote:
    "[Depoimento real: o que mudou no dia a dia gerenciando os grupos e nas vendas depois do HubFlow — 2 ou 3 frases, na voz do cliente.]",
  name: "[Nome do cliente]",
  store: "[Loja] · [Cidade–UF]",
  stats: [
    { value: 0, prefix: "", suffix: "", label: "[grupos gerenciados]" },
    { value: 0, prefix: "", suffix: "s", label: "[tempo por disparo]" },
    { value: 0, prefix: "R$ ", suffix: "", label: "[faturamento / semana]" },
  ],
};

const FEATURES = [
  {
    icon: Send,
    eyebrow: "Disparo em massa",
    title: "Uma oferta. Todos os grupos. Um clique.",
    body: "Mande texto, vídeo, áudio e imagem para todos os seus grupos de uma vez — no ritmo seguro pro seu número não cair.",
  },
  {
    icon: CalendarClock,
    eyebrow: "Agendamento",
    title: "Programe a semana inteira em 1 clique.",
    body: "Monte a rotina de ofertas uma vez e deixe rodar. O HubFlow envia sozinho, nos dias e horários certos.",
  },
  {
    icon: Library,
    eyebrow: "Biblioteca de criativos",
    title: "Criativos e copy prontos pra disparar.",
    body: "Criativos pra anúncio e copies de oferta, promoção e reativação. Escolha, personalize e mande pra todos os grupos.",
  },
  {
    icon: Images,
    eyebrow: "Config em massa",
    title: "Nome e foto de todos os grupos num clique.",
    body: "Padronize a sua marca em dezenas de grupos de uma vez. Nome, foto e descrição deixam de ser tarde inteira.",
  },
  {
    icon: Plus,
    eyebrow: "Auto-criação",
    title: "Grupo encheu? Ele cria o próximo.",
    body: "O HubFlow abre o próximo grupo sozinho e direciona a galera nova. Você nunca perde venda por falta de espaço.",
  },
  {
    icon: BarChart3,
    eyebrow: "Monitoramento",
    title: "Todos os grupos vivos, num painel só.",
    body: "Membros, saúde da conversa, quem lotou e o que precisa de atenção — acompanhado sem você conferir na mão.",
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
            <a href="#como" className="text-sm text-bruma/60 transition hover:text-white">
              Como funciona
            </a>
            <a href="#planos" className="text-sm text-bruma/60 transition hover:text-white">
              Planos
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
          <p className="mx-auto mt-6 max-w-xl text-lg text-bruma/65">
            Dispare texto, vídeo e áudio para todos os grupos de uma vez, agende a semana inteira e
            deixe o HubFlow encher, monitorar e criar grupos no automático.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={SIGNUP_URL} size="lg">
              Criar conta grátis
            </Cta>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.06]"
            >
              <MessageCircle className="h-4 w-4 text-iris-claro" /> Falar no WhatsApp
            </a>
          </div>
          <p className="font-data mt-7 text-xs uppercase tracking-wider text-bruma/40">
            Conecta em 2 min · Seu número · Seus contatos são seus · LGPD
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

      {/* TRUST STRIP */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5">
          {[
            "1 clique = todos os grupos",
            "texto · vídeo · áudio",
            "agenda 7 dias por semana",
            "número protegido (anti-ban)",
          ].map((t) => (
            <span key={t} className="font-data flex items-center gap-2 text-xs uppercase tracking-wider text-bruma/50">
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ============ FUNCIONALIDADES (grid bento) ============ */}
      <section id="recursos" className="relative">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow n="01" center>
              Na prática
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.8rem] sm:leading-[1.05]">
              Faça menos. <span className="hf-gradient-text">Venda mais.</span>
            </h2>
            <p className="mt-5 text-bruma/60">
              Tudo que dava uma manhã de trabalho — copiar oferta grupo por grupo, trocar foto, abrir
              grupo novo — vira um clique.
            </p>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <FeatureCard feature={f} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ MECANISMO (animação grupos → hub) ============ */}
      <section className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]">
        <div className="hf-eclipse pointer-events-none absolute -right-40 top-1/2 h-[36rem] w-[36rem] -translate-y-1/2 opacity-40" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:py-28 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Eyebrow n="02">O mecanismo</Eyebrow>
            <h2 className="font-display max-w-md text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              Um maestro pra todos os grupos.
            </h2>
            <p className="mt-5 max-w-md text-bruma/60">
              Cada grupo é um nó. O HubFlow centraliza todos e, de um ponto só, dispara, agenda e
              monitora — texto, vídeo e áudio chegando em todos ao mesmo tempo. Quando um enche, outro
              nasce sozinho.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                "Disparo simultâneo pra dezenas de grupos",
                "Auto-criação quando o grupo lota",
                "Monitoramento contínuo, sem você conferir",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-bruma/70">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <FlowVisual className="mx-auto w-full max-w-lg" />
        </div>
      </section>

      {/* ============ SHOWCASE MULTI-GRUPO (tela real) ============ */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:py-28 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow n="03">Multi-grupo</Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl">
              Gerencie mil grupos como se fosse um.
            </h2>
            <p className="mt-5 text-bruma/60">
              Todos os grupos lado a lado, ao vivo. Veja membros, saúde da conversa, quem está lotado
              e o que precisa de atenção — e dispare pra qualquer grupo direto da lista.
            </p>
            <ul className="mt-7 space-y-2.5">
              {[
                "Saúde da conversa por grupo",
                "Quem lotou e quem precisa de atenção",
                "Disparar e lotar grupos na hora",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-bruma/70">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <Reveal>
            <ProductFrame
              src="/product/painel-grupos.png"
              alt="Painel multi-grupo do HubFlow"
              chrome="hubflow · grupos"
              className="hf-glow"
            />
          </Reveal>
        </div>
      </section>

      {/* ============ COMO FUNCIONA (passos) ============ */}
      <section id="como" className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow n="04" center>
              Como funciona
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              Do caos ao controle em 4 passos.
            </h2>
            <p className="mt-5 text-bruma/60">
              Você conecta lendo um QR Code — em 2 minutos. Daí o HubFlow assume o peso: centraliza,
              dispara e mede.
            </p>
          </div>
          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Step n="01" icon={QrCode} title="Conecta">
              Leia o QR Code: seu número de sempre, sem chip novo, sem burocracia.
            </Step>
            <Step n="02" icon={Network} title="Centraliza">
              Importe ou crie seus grupos e veja todos num painel só.
            </Step>
            <Step n="03" icon={Send} title="Dispara">
              Uma oferta vai pra todos os grupos — texto, vídeo e áudio.
            </Step>
            <Step n="04" icon={BarChart3} title="Mede">
              O resultado de cada grupo volta pra você, em português.
            </Step>
          </div>
        </div>
      </section>

      {/* ============ AUTOMAÇÃO ============ */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <Eyebrow n="05">No automático</Eyebrow>
          <h2 className="font-display max-w-3xl text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
            Enquanto você vende, ele cuida da operação.
          </h2>
          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            <DarkCard icon={Plus} title="Auto-criação de grupos">
              Grupo encheu? O HubFlow cria o próximo sozinho e já direciona a galera nova pra ele.
            </DarkCard>
            <DarkCard icon={BarChart3} title="Monitoramento contínuo">
              Ele acompanha seus grupos sem parar e te avisa o que precisa de atenção.
            </DarkCard>
            <DarkCard icon={ShieldCheck} title="Número protegido">
              Ritmo seguro de envio e número mascarado pra reduzir risco de bloqueio.
            </DarkCard>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <Pillar icon={TrendingUp} title="Encher">
              Mais grupos, mais gente, mais espaço pra vender — com criação automática quando lotam.
            </Pillar>
            <Pillar icon={Send} title="Vender">
              Sua oferta na frente de todos os grupos, todo dia, no piloto automático.
            </Pillar>
            <Pillar icon={Wallet} title="Medir">
              Saber o que entrou e de onde — sem planilha, em português claro.
            </Pillar>
          </div>
        </div>
      </section>

      {/* ============ RESULTADOS (tela real) ============ */}
      <section className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow n="06" center>
              O número real
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              O caminho até a venda, sem número inflado.
            </h2>
            <p className="mt-5 text-bruma/60">
              Funil real, receita por campanha e quanto cada real de anúncio virou venda — em
              português, sem planilha.
            </p>
          </div>
          <Reveal className="mt-12">
            <ProductFrame
              src="/product/painel-resultados.png"
              alt="Painel HubFlow — resultados e funil"
              chrome="hubflow · resultados"
              aspect="1220 / 862"
              className="hf-glow"
            />
          </Reveal>
        </div>
      </section>

      {/* ============ PROVA ============ */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow n="07" center>
              Quem botou método
            </Eyebrow>
          </div>
          <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <blockquote className="font-editorial text-3xl italic leading-snug text-white sm:text-4xl">
                “{PROOF.quote}”
              </blockquote>
              <div className="mt-7 flex items-center gap-3">
                {/* TODO: foto real do cliente */}
                <div className="h-11 w-11 shrink-0 rounded-full bg-white/10" aria-hidden />
                <div>
                  <p className="font-medium text-white">{PROOF.name}</p>
                  <p className="font-data text-xs uppercase tracking-wider text-bruma/45">
                    {PROOF.store}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 lg:grid-cols-1">
              {PROOF.stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="font-display text-3xl font-extrabold text-iris-claro sm:text-4xl">
                    <Counter to={s.value} prefix={s.prefix} suffix={s.suffix} />
                  </p>
                  <p className="font-data mt-1 text-xs uppercase tracking-wider text-bruma/45">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ PLANOS ============ */}
      <section id="planos" className="relative overflow-hidden border-y border-white/10 bg-white/[0.02]">
        <div className="hf-eclipse pointer-events-none absolute left-1/2 top-0 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 opacity-30" />
        <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow n="08" center>
              Planos
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              Planos que crescem com você.
            </h2>
            <p className="mt-5 text-bruma/60">
              Menos que um funcionário pra tocar os grupos na mão. Sobe de plano quando crescer, sem
              fidelidade.
            </p>
          </div>
          <div className="mt-12">
            <Pricing signupUrl={SIGNUP_URL} whatsappUrl={WHATSAPP_URL} />
          </div>
          <p className="font-data mt-8 text-center text-xs uppercase tracking-wider text-bruma/45">
            Sem fidelidade · Cancela quando quiser · Garantia de 30 dias
          </p>
        </div>
      </section>

      {/* ============ GARANTIA ============ */}
      <section className="relative">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.05] p-8 text-center sm:p-12">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">
              O risco é nosso.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-bruma/60">
              Garantia de <strong className="text-white">30 dias</strong>: se em um mês você não
              estiver disparando pra todos os seus grupos com o número protegido, devolvemos a
              mensalidade.
            </p>
            <div className="font-data mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs uppercase tracking-wider text-bruma/55">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-400" /> Sem fidelidade
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-400" /> Seus contatos são seus
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-400" /> Suporte de gente
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="relative">
        <div className="mx-auto max-w-3xl px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow n="09" center>
              Dúvidas
            </Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-white sm:text-[2.6rem] sm:leading-[1.05]">
              O que costumam perguntar.
            </h2>
          </div>
          <div className="mt-12 space-y-3">
            {[
              ["Preciso trocar de número?", "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem burocracia."],
              ["É difícil? Não entendo de tecnologia.", "Se você usa WhatsApp, usa o HubFlow. Tudo em português, com modelos prontos e suporte de gente."],
              ["Quantos grupos posso gerenciar?", "No Growth, grupos ilimitados — todos num painel só. E quando um enche, o HubFlow cria o próximo sozinho."],
              ["Dá pra enviar vídeo e áudio pra todos?", "Sim. O disparo é multi-formato: texto, imagem, vídeo e áudio vão pra todos os grupos com um clique."],
              ["Meu número corre risco de bloqueio?", "O HubFlow envia num ritmo seguro (anti-ban) e com número mascarado pra reduzir o risco. Seu ativo, protegido."],
              ["Meus contatos ficam comigo se eu cancelar?", "Sim. É o seu número, seus contatos são seus. Cancelou, leva tudo. Sem fidelidade, sem multa."],
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
          <p className="mx-auto mt-5 max-w-xl text-bruma/65">
            Conecte em 2 minutos e dispare pra todos os seus grupos hoje mesmo — no seu próprio
            número, no automático.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={SIGNUP_URL} size="lg">
              Criar conta grátis
            </Cta>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-6 py-3.5 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.06]"
            >
              <MessageCircle className="h-4 w-4 text-iris-claro" /> Falar no WhatsApp
            </a>
          </div>
          <p className="font-data mt-7 text-xs uppercase tracking-wider text-bruma/40">
            Teste sem risco · Cancela quando quiser · Seus contatos continuam seus
          </p>
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
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 text-white"
        >
          <MessageCircle className="h-5 w-5" />
        </a>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-breu">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-12 pb-28 text-bruma/50 sm:flex-row sm:pb-12">
          <div className="text-center sm:text-left">
            <Logo wordmarkClassName="text-white" />
            <p className="font-data mt-2 text-xs uppercase tracking-wider text-bruma/40">
              O fluxo que vende.
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            <a href="#recursos" className="transition hover:text-white">
              Recursos
            </a>
            <a href="#planos" className="transition hover:text-white">
              Planos
            </a>
            <Link href="/login" className="transition hover:text-white">
              Entrar
            </Link>
            <a href={WHATSAPP_URL} className="transition hover:text-white">
              WhatsApp
            </a>
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

function FeatureCard({ feature }: { feature: (typeof FEATURES)[number] }) {
  const { icon: Icon, eyebrow, title, body } = feature;
  return (
    <div className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-iris/40 hover:bg-white/[0.05]">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-iris/15 text-iris-claro transition group-hover:bg-iris group-hover:text-white">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-data mt-5 text-xs uppercase tracking-wider text-iris-claro/80">{eyebrow}</p>
      <p className="font-display mt-2 text-xl font-bold text-white">{title}</p>
      <p className="mt-2 text-sm text-bruma/60">{body}</p>
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: string;
  icon: typeof Send;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-iris/40">
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-iris/15 text-iris-claro transition group-hover:bg-iris group-hover:text-white">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-data text-sm tabular-nums text-bruma/30">{n}</span>
      </div>
      <p className="font-display mt-6 text-xl font-bold text-white">{title}</p>
      <p className="mt-2 text-sm text-bruma/60">{children}</p>
    </div>
  );
}

function DarkCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Send;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-iris/40">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-display mt-5 text-xl font-bold text-white">{title}</p>
      <p className="mt-2 text-bruma/60">{children}</p>
    </div>
  );
}

function Pillar({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Send;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-iris/15 text-iris-claro">
        <Icon className="h-6 w-6" />
      </span>
      <p className="font-display mt-6 text-2xl font-bold text-white">{title}</p>
      <p className="mt-2 text-bruma/60">{children}</p>
    </div>
  );
}
