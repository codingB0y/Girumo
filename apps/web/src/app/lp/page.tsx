import Image from "next/image";
import { Outfit } from "next/font/google";
import { ArrowRight, Check } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { LpNav } from "@/components/lp/nav";
import { LpFx } from "@/components/lp/fx";
import { MethodAccordion } from "@/components/lp/method-accordion";
import { ManualCostCalculator } from "@/components/lp/calculator";
import "./lp.css";

/* Tipografia própria da /lp (branding da landing raiz não se aplica aqui). */
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-lp",
  display: "swap",
});

/* Experimento de conversão: noindex enquanto roda em paralelo com a landing raiz,
   pra não competir com ela no Google. Remover quando esta virar a oficial. */
export const metadata = {
  title: "HubFlow — Grupos de WhatsApp pra atacado de roupa",
  description:
    "O HubFlow lota seus grupos de WhatsApp com revendedores, publica sua oferta em todos de uma vez e mostra de qual grupo veio cada venda. Feito por quem levou um atacado de R$5 mil a R$350 mil por mês.",
  robots: { index: false, follow: false },
};

const SIGNUP_URL = "/signup";
const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20o%20HubFlow.";

const MARQUEE_WORDS = [
  "grade nova",
  "grupo lotado",
  "pedido fechado",
  "revendedor novo",
  "novidade no ar",
  "reposição em dia",
];

const PLANS = [
  {
    name: "Essencial",
    price: 197,
    who: "Pra botar os primeiros grupos pra rodar.",
    features: [
      "1 número de WhatsApp",
      "Até 5 grupos gerenciados",
      "Disparo de texto e imagem",
      "Agendamento de mensagens",
    ],
    featured: false,
  },
  {
    name: "Growth",
    price: 297,
    who: "Pra quem opera dezenas de grupos todo dia.",
    features: [
      "Grupos ilimitados",
      "Grupo lotou, o próximo nasce sozinho",
      "Página de captação com a sua marca",
      "Agenda semanal em 1 clique",
      "Cada pedido com origem rastreada",
    ],
    featured: true,
  },
  {
    name: "Operação",
    price: 497,
    who: "Pra quem quer um time junto na operação.",
    features: [
      "Tudo do Growth",
      "Setup e operação assistidos",
      "Revisão estratégica mensal 1:1",
      "Prioridade no suporte",
    ],
    featured: false,
  },
];

const FAQ = [
  [
    "Preciso trocar de número?",
    "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem app extra.",
  ],
  [
    "É difícil de usar?",
    "Se você usa WhatsApp, usa o HubFlow. Painel em português e modelos prontos de página e de mensagem — você quase não configura nada.",
  ],
  [
    "Quantos grupos consigo gerenciar?",
    "No Growth, ilimitados. 50, 100 ou mais — todos num painel só. E quando um enche, o próximo nasce sozinho.",
  ],
  [
    "E se eu não gostar?",
    "Você tem 30 dias de garantia incondicional. Usou, não curtiu, devolvemos 100% — sem pergunta, sem burocracia.",
  ],
  [
    "Meus contatos ficam comigo se eu cancelar?",
    "Sim. O número é seu, os grupos são seus, os contatos são seus. Sem fidelidade, sem multa.",
  ],
];

export default function LpExperience() {
  return (
    <div className={`lp3 ${outfit.variable} min-h-screen`}>
      <main className="w-full max-w-full overflow-x-clip">
        <div className="lp3-grain" aria-hidden />
        <LpNav signupUrl={SIGNUP_URL} />

        {/* ==================== HERO — assimetria editorial ==================== */}
        <section className="lp3-wash relative flex min-h-[100svh] items-center overflow-hidden pb-24 pt-36">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p data-lp-hi className="lp3-mono flex items-center gap-2.5 text-[11px] text-[var(--lp-muted)]">
                <span className="lp3-pulse h-2 w-2 rounded-full bg-[var(--lp-accent)]" aria-hidden />
                grupos de whatsapp pra atacado de roupa
              </p>

              <h1
                data-lp-hi
                className="mt-7 max-w-4xl text-balance text-[clamp(2.7rem,5.1vw,4.9rem)] font-extrabold leading-[1.03] tracking-[-0.03em]"
              >
                Lote seus grupos de Revendedores, Sacoleiras e Lojistas. Poste em todos.{" "}
                <span className="lp3-marker">Venda todo dia.</span>
              </h1>

              <p data-lp-hi className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-[var(--lp-muted)]">
                O HubFlow lota seus grupos de WhatsApp com revendedores, publica sua oferta em
                todos de uma vez e mostra de qual grupo veio cada venda. Feito por quem levou um
                atacado de roupa de R$ 5 mil a R$ 350 mil por mês fazendo exatamente isso.
              </p>

              <div data-lp-hi className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href={SIGNUP_URL} className="lp3-btn lp3-btn-ink">
                  Criar minha campanha <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <a href={WHATSAPP_URL} className="lp3-btn lp3-btn-ghost">
                  <WhatsAppIcon className="h-4 w-4 text-[var(--lp-green)]" aria-hidden /> Falar no WhatsApp
                </a>
              </div>

              <p data-lp-hi className="lp3-mono mt-9 text-[10px] text-[var(--lp-muted)]">
                feito por atacadista, pra atacadista · 30 dias de garantia
              </p>
            </div>

            {/* cluster flutuante — a esteira em miniatura sobre still editorial */}
            <div data-lp-hi className="relative h-[420px] lg:col-span-5 lg:h-[520px]">
              <div className="absolute bottom-8 right-0 top-8 w-[76%] rotate-[2deg] overflow-hidden rounded-[2rem] border border-[var(--lp-line)] shadow-[0_50px_100px_-50px_rgba(20,19,16,0.5)]">
                <Image
                  src="/lp/still-atacado.webp"
                  alt=""
                  width={928}
                  height={1152}
                  priority
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(244,241,233,0.35)] to-transparent" aria-hidden />
              </div>

              <div className="lp3-card lp3-float-c absolute left-4 top-0 rotate-[-3deg] px-4 py-2.5">
                <p className="font-mono text-xs">hubflow.com.br/c/novidades</p>
              </div>

              <div className="lp3-card lp3-float-a absolute right-0 top-14 w-[290px] p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <WhatsAppIcon className="h-4 w-4 text-[var(--lp-green)]" aria-hidden /> Mega VIP 07
                  </p>
                  <span className="lp3-mono text-[9px] text-[var(--lp-accent)]">lotado</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--lp-line)]">
                  <div className="lp3-fill h-full rounded-full bg-[var(--lp-ink)]" />
                </div>
                <p className="lp3-mono mt-2.5 text-[9px] text-[var(--lp-muted)]">
                  1.024 / 1.024 revendedores
                </p>
              </div>

              <div className="lp3-card lp3-float-b absolute left-0 top-52 w-[260px] p-5">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <span className="lp3-pulse h-2 w-2 rounded-full bg-[var(--lp-accent)]" aria-hidden />
                  VIP 08 criado agora
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--lp-muted)]">
                  O link da campanha já aponta pra ele. Nenhum clique perdido.
                </p>
              </div>

              <div className="lp3-card lp3-float-c absolute bottom-4 right-8 w-[250px] p-5">
                <p className="lp3-mono text-[9px] text-[var(--lp-accent)]">novo pedido</p>
                <p className="mt-1.5 text-sm font-bold">Marina S. — R$ 186</p>
                <p className="lp3-mono mt-1 text-[9px] text-[var(--lp-muted)]">
                  origem: anúncio · grupo vip 07
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== MARQUEE — vocabulário do balcão ==================== */}
        <section className="lp3-dark overflow-hidden py-7" aria-hidden>
          <div className="lp3-marquee">
            {[0, 1].map((dup) => (
              <div key={dup} className="flex shrink-0 items-center">
                {MARQUEE_WORDS.map((w) => (
                  <span key={`${dup}-${w}`} className="flex items-center">
                    <span className="lp3-marquee-word whitespace-nowrap px-7 text-5xl font-extrabold uppercase tracking-tight md:text-6xl">
                      {w}
                    </span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--lp-accent)]" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ==================== BENTO — a rotina inteira ==================== */}
        <section className="py-28 md:py-44">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="max-w-3xl">
              <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] font-extrabold leading-[1.06] tracking-tight">
                A rotina inteira do atacado,{" "}
                <span className="text-[var(--lp-muted)]">numa ferramenta só.</span>
              </h2>
              <p className="mt-5 max-w-xl text-lg text-[var(--lp-muted)]">
                Do link que capta o revendedor ao pedido rastreado — sem copiar e colar grupo por
                grupo, sem planilha do lado.
              </p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-6 md:[grid-auto-flow:dense]">
              {/* A — página de captação (4x2) */}
              <article data-lp-zoom className="lp3-bento-card flex flex-col p-8 md:col-span-4 md:row-span-2">
                <h3 className="text-xl font-bold tracking-tight">A página que lota o grupo</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--lp-muted)]">
                  Modelo pronto, com a sua marca, publicado em minutos. Quem clica cai direto no
                  grupo certo — rastreado desde o anúncio.
                </p>
                <div className="mt-8 flex flex-1 items-end justify-center gap-8">
                  <div className="w-[190px] rounded-[1.5rem] border border-[var(--lp-line)] bg-[var(--lp-paper)] p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 rounded-md bg-[var(--lp-accent-soft)]" />
                      <span className="text-xs font-bold">Sua Loja Atacado</span>
                    </div>
                    <p className="mt-3 text-sm font-bold leading-snug">
                      Grade nova toda quarta, antes de todo mundo
                    </p>
                    <div className="mt-3 rounded-lg bg-[var(--lp-green)] py-2 text-center text-xs font-semibold text-white">
                      Entrar no grupo VIP
                    </div>
                    <p className="lp3-mono mt-2 text-center text-[8px] text-[var(--lp-muted)]">
                      restam 43 vagas
                    </p>
                  </div>
                  <div className="hidden flex-1 sm:block">
                    <p className="lp3-mono text-[9px] text-[var(--lp-muted)]">grupo enchendo</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Array.from({ length: 21 }).map((_, i) => (
                        <span
                          key={i}
                          className="h-3 w-3 rounded-full"
                          style={{ background: `rgba(29, 168, 81, ${0.25 + ((i * 7) % 10) / 14})` }}
                        />
                      ))}
                    </div>
                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--lp-line)]">
                      <div className="h-full w-[72%] rounded-full bg-[var(--lp-green)]" />
                    </div>
                  </div>
                </div>
              </article>

              {/* B — auto-criação (2x1) */}
              <article data-lp-zoom className="lp3-bento-card p-7 md:col-span-2">
                <h3 className="text-lg font-bold tracking-tight">Lotou? O próximo já nasce</h3>
                <div className="mt-5 space-y-2.5">
                  <div className="flex items-center justify-between rounded-xl border border-[var(--lp-line)] px-4 py-2.5 opacity-60">
                    <span className="text-xs font-semibold">VIP 03</span>
                    <span className="lp3-mono text-[9px]">1.024 · cheio</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[var(--lp-accent)] bg-[var(--lp-accent-soft)] px-4 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <span className="lp3-pulse h-1.5 w-1.5 rounded-full bg-[var(--lp-accent)]" /> VIP 04
                    </span>
                    <span className="lp3-mono text-[9px]">criado agora</span>
                  </div>
                </div>
              </article>

              {/* C — 1 clique todos (2x1) */}
              <article data-lp-zoom className="lp3-bento-card p-7 md:col-span-2">
                <h3 className="text-lg font-bold tracking-tight">Um clique, todos os grupos</h3>
                <div className="mt-5 space-y-2">
                  {["VIP 01 · Atacado", "VIP 02 · Pronta entrega", "VIP 03 · Outlet"].map((g) => (
                    <div key={g} className="flex items-center justify-between rounded-xl bg-[var(--lp-paper)] px-4 py-2">
                      <span className="lp3-mono text-[9px] text-[var(--lp-muted)]">{g}</span>
                      <Check className="h-3.5 w-3.5 text-[var(--lp-green)]" aria-hidden />
                    </div>
                  ))}
                </div>
              </article>

              {/* D — origem da venda (3x1) */}
              <article data-lp-zoom className="lp3-bento-card p-7 md:col-span-3">
                <h3 className="text-lg font-bold tracking-tight">Cada pedido com origem</h3>
                <div className="mt-5 space-y-3">
                  {[
                    ["Anúncio", 82, "R$ 12,4 mil"],
                    ["Story", 46, "R$ 6,2 mil"],
                    ["Bio", 22, "R$ 3,1 mil"],
                  ].map(([label, pct, val]) => (
                    <div key={label as string}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-[var(--lp-muted)]">{label}</span>
                        <span className="font-mono font-semibold">{val}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--lp-line)]">
                        <div className="h-full rounded-full bg-[var(--lp-accent)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              {/* E — biblioteca (3x1) */}
              <article data-lp-zoom className="lp3-bento-card p-7 md:col-span-3">
                <h3 className="text-lg font-bold tracking-tight">Copys e criativos prontos</h3>
                <p className="mt-2 text-sm text-[var(--lp-muted)]">
                  Biblioteca feita pra vender no grupo. Copie, ajuste, dispare.
                </p>
                <div className="mt-4 space-y-2">
                  {["Oferta relâmpago", "Reativação de sumidos"].map((t) => (
                    <div key={t} className="flex items-center justify-between rounded-xl border border-[var(--lp-line)] px-4 py-2.5">
                      <span className="text-xs font-semibold">{t}</span>
                      <span className="lp3-mono text-[9px] text-[var(--lp-accent)]">usar</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ==================== CASE — capítulo escuro ==================== */}
        <section id="case" className="lp3-dark py-28 md:py-44">
          <div className="mx-auto max-w-6xl px-5">
            <p data-lp-reveal className="lp3-mono text-[11px] text-[rgba(244,241,233,0.5)]">
              goiânia · região da 44 · história real
            </p>
            <h2
              data-lp-reveal
              className="mt-6 max-w-5xl text-[clamp(2.1rem,4.6vw,3.9rem)] font-extrabold leading-[1.05] tracking-tight"
            >
              A gente levou a <span className="lp3-chip">Mega Stock</span> de R$ 5 mil a{" "}
              <span className="text-[var(--lp-accent)]">R$ 350 mil</span> por mês.
            </h2>

            <p data-lp-scrub className="mt-10 max-w-3xl text-xl leading-relaxed text-[rgba(244,241,233,0.9)] md:text-2xl">
              Atacado de roupa infantil, balcão na 44, tudo feito na mão. A virada foi transformar
              o grupo de WhatsApp em canal de venda: página de captação enchendo grupo, revendedor
              entrando todo dia, novidade postada cedo, pedido rastreado até o fim. E o estoque
              girando como nunca.
            </p>

            <div className="lp3-stack mt-24">
              <article className="lp3-stack-card lp3-dark-card p-8 md:p-14" style={{ top: "88px" }}>
                <div className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight md:text-3xl">A operação era de verdade.</h3>
                    <p className="mt-4 max-w-2xl text-base leading-relaxed text-[rgba(244,241,233,0.65)] md:text-lg">
                      Galpão de 800 m² na Perimetral, equipe de vendas no balcão e um Instagram com
                      105 mil seguidores. Não é teoria de palco — é loja que abria cedo e despachava
                      pro Brasil inteiro. O vídeo aí do lado é um bazar nosso, avisado só nos grupos.
                    </p>
                    <p className="lp3-mono mt-8 text-[10px] text-[var(--lp-accent)]">
                      quem nunca operou um atacado não constrói ferramenta pra atacado
                    </p>
                  </div>
                  <div className="mx-auto w-full max-w-[280px]">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-[1.75rem] border border-[rgba(244,241,233,0.14)] bg-black shadow-[0_40px_90px_-40px_rgba(0,0,0,0.8)]">
                      <iframe
                        src="https://player.vimeo.com/video/1207228037?autoplay=1&muted=1&loop=1&title=0&byline=0&portrait=0&dnt=1"
                        allow="autoplay; fullscreen; picture-in-picture"
                        loading="lazy"
                        title="Bazar Mega Stock — loja cheia durante o evento avisado nos grupos"
                        className="absolute inset-0 h-full w-full"
                      />
                    </div>
                    <p className="lp3-mono mt-3 text-center text-[9px] text-[rgba(244,241,233,0.45)]">
                      bazar mega stock · evento avisado nos grupos
                    </p>
                  </div>
                </div>
              </article>

              <article className="lp3-stack-card lp3-dark-card p-8 md:p-14" style={{ top: "106px" }}>
                <h3 className="text-2xl font-bold tracking-tight md:text-3xl">Os números que ficaram.</h3>
                <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
                  <div>
                    <dt className="text-4xl font-extrabold tracking-tight md:text-5xl">
                      R$ <span data-lp-count data-to="350">350</span> mil
                    </dt>
                    <dd className="lp3-mono mt-2 text-[10px] text-[rgba(244,241,233,0.5)]">por mês</dd>
                  </div>
                  <div>
                    <dt className="text-4xl font-extrabold tracking-tight md:text-5xl">
                      <span data-lp-count data-to="12000" data-sep>12.000</span>
                    </dt>
                    <dd className="lp3-mono mt-2 text-[10px] text-[rgba(244,241,233,0.5)]">revendedores</dd>
                  </div>
                  <div>
                    <dt className="text-4xl font-extrabold tracking-tight md:text-5xl">
                      <span data-lp-count data-to="50">50</span>+
                    </dt>
                    <dd className="lp3-mono mt-2 text-[10px] text-[rgba(244,241,233,0.5)]">grupos ativos</dd>
                  </div>
                  <div>
                    <dt className="text-4xl font-extrabold tracking-tight md:text-5xl">
                      <span data-lp-count data-to="20">20</span> mil
                    </dt>
                    <dd className="lp3-mono mt-2 text-[10px] text-[rgba(244,241,233,0.5)]">
                      peças num evento de 2 dias
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="lp3-stack-card lp3-dark-card p-8 md:p-14" style={{ top: "124px" }}>
                <h3 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Cansamos de fazer na mão. Construímos a ferramenta.
                </h3>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-[rgba(244,241,233,0.65)] md:text-lg">
                  O HubFlow nasceu dentro dessa operação — pra lotar grupo, postar em todos de uma
                  vez e mostrar de onde veio cada pedido. O método virou produto. Agora ele é seu.
                </p>
                <a href={SIGNUP_URL} className="lp3-btn lp3-btn-paper mt-8">
                  Criar minha campanha <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* ==================== MÉTODO — acordeão horizontal ==================== */}
        <section id="metodo" className="py-28 md:py-44">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="max-w-3xl">
              <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] font-extrabold leading-[1.06] tracking-tight">
                O jeito Mega Stock de vender,{" "}
                <span className="text-[var(--lp-muted)]">do link ao evento.</span>
              </h2>
              <p className="mt-5 max-w-xl text-lg text-[var(--lp-muted)]">
                Os quatro movimentos que a gente repetia toda semana — e que a ferramenta executa
                com você.
              </p>
            </div>
            <div data-lp-reveal className="mt-14">
              <MethodAccordion />
            </div>
          </div>
        </section>

        {/* ==================== CALCULADORA ==================== */}
        <section className="border-t border-[var(--lp-line)] py-28 md:py-44">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="max-w-3xl">
              <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] font-extrabold leading-[1.06] tracking-tight">
                Postar na mão <span className="lp3-marker">custa caro.</span>
              </h2>
              <p className="mt-5 max-w-xl text-lg text-[var(--lp-muted)]">
                Faça a conta da sua operação. O tempo que some todo mês é venda que não aconteceu.
              </p>
            </div>
            <div data-lp-reveal className="mt-14">
              <ManualCostCalculator signupUrl={SIGNUP_URL} />
            </div>
          </div>
        </section>

        {/* ==================== PLANOS ==================== */}
        <section id="planos" className="border-t border-[var(--lp-line)] py-28 md:py-44">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="mx-auto max-w-2xl text-center">
              <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] font-extrabold leading-[1.06] tracking-tight">
                Menos que uma grade <span className="text-[var(--lp-muted)]">por mês.</span>
              </h2>
              <p className="mt-5 text-lg text-[var(--lp-muted)]">
                A Mega Stock fez R$ 350 mil num mês com esse jeito de vender. Escolha o tamanho da
                sua operação — e troque quando crescer.
              </p>
            </div>

            <div className="mt-16 grid items-stretch gap-5 md:grid-cols-3">
              {PLANS.map((p) => (
                <article
                  key={p.name}
                  data-lp-zoom
                  className={`lp3-bento-card relative flex flex-col p-8 ${
                    p.featured ? "border-[var(--lp-accent)] shadow-[0_30px_80px_-40px_rgba(232,73,15,0.45)] md:-my-3 md:py-11" : ""
                  }`}
                >
                  {p.featured && (
                    <span className="lp3-mono absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--lp-accent)] px-4 py-1.5 text-[9px] font-semibold text-white">
                      mais escolhido
                    </span>
                  )}
                  <h3 className="text-2xl font-extrabold tracking-tight">{p.name}</h3>
                  <p className="mt-1.5 text-sm text-[var(--lp-muted)]">{p.who}</p>
                  <p className="mt-7 flex items-baseline gap-1.5">
                    <span className="lp3-mono text-xs text-[var(--lp-muted)]">R$</span>
                    <span className="text-6xl font-extrabold leading-none tracking-tight">{p.price}</span>
                    <span className="lp3-mono text-xs text-[var(--lp-muted)]">/mês</span>
                  </p>
                  <ul className="mt-8 flex-1 space-y-3 border-t border-[var(--lp-line)] pt-7">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm leading-snug">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-accent)]" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={SIGNUP_URL}
                    className={`lp3-btn mt-8 justify-center text-sm ${p.featured ? "lp3-btn-accent" : "lp3-btn-ghost"}`}
                  >
                    Começar com {p.name}
                  </a>
                </article>
              ))}
            </div>

            {/* garantia */}
            <div data-lp-reveal className="lp3-card mt-14 flex flex-col items-center gap-6 p-9 text-center md:flex-row md:gap-12 md:p-12 md:text-left">
              <p className="text-[5.5rem] font-extrabold leading-none tracking-tight text-[var(--lp-accent)] md:text-[7rem]">
                30
              </p>
              <div>
                <h3 className="text-xl font-bold tracking-tight md:text-2xl">
                  dias de garantia incondicional
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--lp-muted)] md:text-base">
                  Usou, não curtiu, devolvemos 100% — sem pergunta, sem burocracia. E os grupos e
                  contatos continuam seus, de qualquer jeito.
                </p>
                <p className="lp3-mono mt-4 text-[10px] text-[var(--lp-muted)]">
                  sem fidelidade · cancele quando quiser
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== FAQ ==================== */}
        <section id="faq" className="border-t border-[var(--lp-line)] py-28 md:py-44">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div data-lp-reveal>
              <h2 className="text-[clamp(1.9rem,3.8vw,3rem)] font-extrabold leading-[1.06] tracking-tight">
                O que perguntam <span className="text-[var(--lp-muted)]">antes de começar.</span>
              </h2>
              <p className="mt-5 max-w-sm text-[var(--lp-muted)]">
                Não achou a sua? Chama no WhatsApp — gente de verdade responde.
              </p>
              <a
                href={WHATSAPP_URL}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-[var(--lp-accent)]"
              >
                <WhatsAppIcon className="h-4 w-4 text-[var(--lp-green)]" aria-hidden /> Perguntar agora
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <div data-lp-reveal>
              {FAQ.map(([q, a]) => (
                <details key={q} className="lp3-faq py-6">
                  <summary className="flex items-center justify-between gap-4">
                    <span className="text-lg font-bold tracking-tight md:text-xl">{q}</span>
                    <span className="lp3-faq-x text-2xl font-light leading-none" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-4 max-w-2xl leading-relaxed text-[var(--lp-muted)]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== CTA FINAL ==================== */}
        <section className="lp3-dark py-32 text-center md:py-48">
          <div className="mx-auto max-w-4xl px-5">
            <h2
              data-lp-reveal
              className="text-balance text-[clamp(2.5rem,6.2vw,5rem)] font-extrabold leading-[1.02] tracking-[-0.03em]"
            >
              Seu próximo grupo cheio começa com um link.
            </h2>
            <p data-lp-reveal className="mx-auto mt-6 max-w-md text-lg text-[rgba(244,241,233,0.6)]">
              Conecte seu WhatsApp em 2 minutos e veja a esteira trabalhar. 30 dias de garantia.
            </p>
            <div data-lp-reveal className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={SIGNUP_URL} className="lp3-btn lp3-btn-paper">
                Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a href={WHATSAPP_URL} className="lp3-btn lp3-btn-ghost-paper">
                <WhatsAppIcon className="h-4 w-4 text-[var(--lp-green)]" aria-hidden /> Falar no WhatsApp
              </a>
            </div>
            <p data-lp-reveal className="lp3-mono mt-9 text-[10px] text-[rgba(244,241,233,0.4)]">
              feito por atacadista, pra atacadista · sem fidelidade · seus contatos são seus
            </p>
          </div>
        </section>

        {/* ==================== FOOTER ==================== */}
        <footer className="border-t border-[var(--lp-line)] py-12">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 text-center sm:flex-row sm:text-left">
            <div>
              <p className="flex items-baseline justify-center gap-1 text-lg font-extrabold tracking-tight sm:justify-start">
                HubFlow <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-accent)]" aria-hidden />
              </p>
              <p className="lp3-mono mt-1.5 text-[9px] text-[var(--lp-muted)]">
                feito por atacadista, pra atacadista
              </p>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--lp-muted)]" aria-label="Links do rodapé">
              <a className="transition-colors hover:text-[var(--lp-ink)]" href="/login">Entrar</a>
              <a className="transition-colors hover:text-[var(--lp-ink)]" href={SIGNUP_URL}>Criar conta</a>
              <a className="transition-colors hover:text-[var(--lp-ink)]" href="/termos">Termos</a>
              <a className="transition-colors hover:text-[var(--lp-ink)]" href="/privacidade">Privacidade</a>
            </nav>
            <p className="text-xs text-[var(--lp-muted)]">© {new Date().getFullYear()} HubFlow</p>
          </div>
        </footer>

        {/* CTA fixo mobile */}
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-[var(--lp-line)] bg-[rgba(255,253,248,0.92)] p-3 backdrop-blur sm:hidden">
          <a href={SIGNUP_URL} className="lp3-btn lp3-btn-ink flex-1 justify-center py-3 text-sm">
            Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={WHATSAPP_URL}
            aria-label="Falar no WhatsApp"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--lp-line)]"
          >
            <WhatsAppIcon className="h-5 w-5 text-[var(--lp-green)]" aria-hidden />
          </a>
        </div>

        <LpFx />
      </main>
    </div>
  );
}
