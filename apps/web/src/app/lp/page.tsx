import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { ManualCostCalculator } from "@/components/lp/calculator";
import { LpFx } from "@/components/lp/fx";
import { LpNav } from "@/components/lp/nav";
import { BRAND, BRAND_PRODUCTS, getPublicSiteUrl } from "@/lib/brand";
import "./lp.css";

export const metadata = {
  title: { absolute: `${BRAND.name} — Grupos de WhatsApp para atacado` },
  description: BRAND.description,
  robots: { index: false, follow: false },
};

const SIGNUP_URL = "/signup";
const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20a%20Girumo.";
const PUBLIC_SITE_LABEL = getPublicSiteUrl().replace(/^https?:\/\//, "");

const ROUTINE_WORDS = [
  "captação organizada",
  "grupos em sequência",
  "campanhas programadas",
  "origem registrada",
  "operação no ritmo",
];

const METHOD = [
  {
    n: "01",
    title: "Publique a página",
    body: "Use uma página direta, com a identidade da sua loja, para captar o contato e encaminhar a pessoa ao destino configurado.",
  },
  {
    n: "02",
    title: "Organize os grupos",
    body: "Centralize a sequência dos grupos e mantenha o caminho de entrada claro para quem chega por cada campanha.",
  },
  {
    n: "03",
    title: "Programe a rotina",
    body: "Prepare mensagens e horários no mesmo fluxo operacional, sem depender de copiar a mesma publicação em várias conversas.",
  },
  {
    n: "04",
    title: "Leia os resultados",
    body: "Consulte a origem registrada e use o histórico da própria operação para decidir o próximo movimento.",
  },
];

const PLANS = [
  {
    name: "Essencial",
    price: 197,
    who: "Para colocar os primeiros grupos em uma rotina organizada.",
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
    who: "Para uma operação com vários grupos e campanhas recorrentes.",
    features: [
      "Grupos ilimitados",
      "Sequência automática de grupos",
      "Página de captação com a sua marca",
      "Agenda semanal",
      "Origem rastreada",
    ],
    featured: true,
  },
  {
    name: "Operação",
    price: 497,
    who: "Para quem quer acompanhamento na configuração da rotina.",
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
    "Não. A conexão usa o número configurado pela sua operação, sem exigir um chip dedicado só para a Girumo.",
  ],
  [
    "É difícil de usar?",
    "A Girumo organiza páginas, grupos, campanhas, agenda e resultados em uma interface em português, com um fluxo guiado.",
  ],
  [
    "O que acontece com meus contatos?",
    "Os contatos e grupos continuam vinculados à sua operação. A página também exibe o consentimento LGPD antes do envio.",
  ],
  [
    "Posso cancelar?",
    "Os planos são apresentados sem fidelidade. Consulte as condições vigentes antes de contratar.",
  ],
] as const;

export default function LpExperience() {
  return (
    <div className="lp3 min-h-screen">
      <main className="w-full max-w-full overflow-x-clip">
        <div className="lp3-grain" aria-hidden />
        <LpNav signupUrl={SIGNUP_URL} />

        <section className="lp3-wash relative flex min-h-[100svh] items-center overflow-hidden pb-24 pt-36">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p data-lp-hi className="lp3-mono flex items-center gap-2.5 text-[11px] text-[var(--lp-muted)]">
                <span className="h-2 w-8 bg-[var(--lp-accent)]" aria-hidden />
                comércio por WhatsApp, em um fluxo só
              </p>
              <h1
                data-lp-hi
                className="mt-7 max-w-4xl text-balance font-display text-[clamp(2.7rem,5.1vw,4.9rem)] font-bold leading-[1.03] tracking-[-0.04em]"
              >
                Seus grupos rodando. <span className="lp3-marker">Você vendendo.</span>
              </h1>
              <p data-lp-hi className="mt-7 max-w-xl text-pretty text-lg leading-relaxed text-[var(--lp-muted)]">
                {BRAND.description} Uma rotina direta para atacadistas que usam o WhatsApp como canal de venda.
              </p>
              <div data-lp-hi className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href={SIGNUP_URL} className="lp3-btn lp3-btn-accent">
                  Criar minha campanha <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <a href={WHATSAPP_URL} className="lp3-btn lp3-btn-ghost">
                  <WhatsAppIcon className="h-4 w-4 text-[var(--lp-whatsapp)]" aria-hidden />
                  Falar no WhatsApp
                </a>
              </div>
              <p data-lp-hi className="lp3-mono mt-9 text-[10px] text-[var(--lp-muted)]">
                páginas · grupos · campanhas · agenda · resultados
              </p>
            </div>

            <div data-lp-hi className="lg:col-span-5">
              <div className="lp3-process-board" aria-label="Diagrama editorial do fluxo Girumo">
                <div className="flex items-center justify-between gap-4 border-b border-[var(--lp-dark-line)] px-5 py-4">
                  <Logo className="text-lg text-paper-0" />
                  <span className="lp3-mono text-[8px] text-canvas-100/55">diagrama do fluxo</span>
                </div>
                <ol className="grid gap-px bg-[var(--lp-dark-line)] sm:grid-cols-2 lg:grid-cols-1">
                  {[
                    ["01", "Página", "capta e registra"],
                    ["02", "Grupos", "organiza o destino"],
                    ["03", "Campanhas", "prepara a mensagem"],
                    ["04", "Agenda", "define o momento"],
                    ["05", "Resultados", "mostra a origem"],
                  ].map(([n, title, text]) => (
                    <li key={n} className="grid grid-cols-[auto_1fr] gap-4 bg-[var(--lp-ink-2)] p-5">
                      <span className="lp3-mono text-[10px] text-[var(--lp-accent)]">{n}</span>
                      <span>
                        <strong className="block text-paper-0">{title}</strong>
                        <span className="mt-1 block text-sm text-canvas-100/60">{text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="border-t border-[var(--lp-dark-line)] bg-[var(--lp-ink)] px-5 py-4">
                  <p className="font-data text-[10px] text-canvas-100/65">{PUBLIC_SITE_LABEL}/p/sua-pagina</p>
                  <p className="mt-2 text-xs text-canvas-100/70">Representação de processo, sem dados de cliente.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp3-dark border-y border-[var(--lp-dark-line)] py-7" aria-label="Etapas da rotina">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5">
            {ROUTINE_WORDS.map((word, index) => (
              <span key={word} className="flex items-center gap-3">
                <span className="lp3-mono text-[10px] text-canvas-100/65">{word}</span>
                {index < ROUTINE_WORDS.length - 1 ? <span className="h-1.5 w-1.5 bg-[var(--lp-accent)]" aria-hidden /> : null}
              </span>
            ))}
          </div>
        </section>

        <section className="py-28 md:py-40">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="max-w-3xl">
              <p className="lp3-eyebrow">uma operação conectada</p>
              <h2 className="lp3-section-title mt-4">
                A rotina inteira do atacado, <span className="text-[var(--lp-muted)]">sem peças soltas.</span>
              </h2>
              <p className="mt-5 max-w-xl text-lg text-[var(--lp-muted)]">
                Cada módulo resolve uma etapa e entrega contexto para a próxima. O desenho abaixo explica o fluxo; não simula pedidos ou resultados.
              </p>
            </div>

            <div className="mt-14 grid gap-4 md:grid-cols-6">
              <article data-lp-zoom className="lp3-bento-card p-8 md:col-span-4">
                <span className="lp3-card-index">01 / captar</span>
                <h3 className="mt-8 text-2xl font-bold tracking-tight">Uma página pública, com destino configurado</h3>
                <p className="mt-3 max-w-xl text-[var(--lp-muted)]">
                  A página reúne a oferta da sua loja, consentimento LGPD e encaminhamento para o grupo ou campanha escolhida.
                </p>
                <div className="mt-8 grid gap-px bg-[var(--lp-line)] sm:grid-cols-3">
                  {["Oferta clara", "Contato consentido", "Destino definido"].map((item) => (
                    <span key={item} className="bg-[var(--lp-paper)] p-4 font-data text-xs">{item}</span>
                  ))}
                </div>
              </article>

              <article data-lp-zoom className="lp3-bento-card lp3-bento-card-dark p-8 text-paper-0 md:col-span-2">
                <span className="lp3-card-index lp3-card-index-dark">02 / organizar</span>
                <h3 className="mt-8 text-2xl font-bold tracking-tight">Grupos em sequência</h3>
                <p className="mt-3 text-canvas-100/65">
                  A operação visualiza os destinos sem depender de listas paralelas e links espalhados.
                </p>
              </article>

              <article data-lp-zoom className="lp3-bento-card p-8 md:col-span-3">
                <span className="lp3-card-index">03 / programar</span>
                <h3 className="mt-8 text-xl font-bold tracking-tight">Mensagem e agenda no mesmo contexto</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--lp-muted)]">
                  Prepare o conteúdo, selecione o destino e defina o horário sem repetir a montagem grupo por grupo.
                </p>
              </article>

              <article data-lp-zoom className="lp3-bento-card lp3-bento-card-cobalt p-8 md:col-span-3">
                <span className="lp3-card-index lp3-card-index-cobalt">04 / entender</span>
                <h3 className="mt-8 text-xl font-bold tracking-tight">Origem registrada para a próxima decisão</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--lp-muted)]">
                  Os resultados apresentados na operação vêm dos eventos registrados pela própria campanha.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="case" className="lp3-dark py-28 md:py-40">
          <div className="mx-auto max-w-6xl px-5">
            <p data-lp-reveal className="lp3-mono text-[10px] text-[var(--lp-accent)]">por que a Girumo existe</p>
            <h2 data-lp-reveal className="mt-6 max-w-5xl font-display text-[clamp(2.2rem,4.8vw,4rem)] font-bold leading-[1.04] tracking-[-0.035em]">
              O WhatsApp já vende. O trabalho ao redor dele precisa acompanhar.
            </h2>
            <p data-lp-scrub className="mt-10 max-w-3xl text-xl leading-relaxed text-canvas-100/80 md:text-2xl">
              A Girumo conecta o que normalmente fica separado: a página que capta, os grupos que recebem, a campanha que comunica, a agenda que organiza e os resultados que orientam.
            </p>

            <div className="lp3-stack mt-20">
              <article className="lp3-stack-card lp3-dark-card p-8 md:p-12" style={{ top: "88px" }}>
                <span className="lp3-mono text-[10px] text-canvas-100/70">antes</span>
                <h3 className="mt-4 text-2xl font-bold md:text-3xl">Links, mensagens e horários em lugares diferentes.</h3>
                <p className="mt-4 max-w-2xl text-canvas-100/65">
                  A fricção não vem de uma única tarefa: vem da troca constante de contexto durante a operação.
                </p>
              </article>
              <article className="lp3-stack-card lp3-dark-card p-8 md:p-12" style={{ top: "106px" }}>
                <span className="lp3-mono text-[10px] text-[var(--lp-accent)]">com Girumo</span>
                <div className="mt-4 grid gap-8 md:grid-cols-[auto_1fr] md:items-end">
                  <p className="font-display text-7xl font-bold text-[var(--lp-accent)]">
                    <span data-lp-count data-to={BRAND_PRODUCTS.length} data-sep>{BRAND_PRODUCTS.length}</span>
                  </p>
                  <div>
                    <h3 className="text-2xl font-bold md:text-3xl">módulos nomeados, uma sequência operacional.</h3>
                    <p className="mt-3 text-canvas-100/65">{BRAND_PRODUCTS.join(" · ")}</p>
                  </div>
                </div>
              </article>
              <article className="lp3-stack-card lp3-dark-card p-8 md:p-12" style={{ top: "124px" }}>
                <span className="lp3-mono text-[10px] text-canvas-100/70">próximo passo</span>
                <h3 className="mt-4 text-2xl font-bold md:text-3xl">Monte a primeira campanha com os dados da sua operação.</h3>
                <a href={SIGNUP_URL} className="lp3-btn lp3-btn-paper mt-8">
                  Criar minha campanha <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </article>
            </div>
          </div>
        </section>

        <section id="metodo" className="py-28 md:py-40">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="max-w-3xl">
              <p className="lp3-eyebrow">método operacional</p>
              <h2 className="lp3-section-title mt-4">Do link ao aprendizado, em quatro movimentos.</h2>
            </div>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-[var(--lp-line)] bg-[var(--lp-line)] md:grid-cols-2">
              {METHOD.map((step) => (
                <li key={step.n} data-lp-reveal className="bg-[var(--lp-paper-2)] p-8 md:p-10">
                  <span className="lp3-mono text-[10px] text-cobalt-700">{step.n}</span>
                  <h3 className="mt-8 text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-[var(--lp-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-[var(--lp-line)] py-28 md:py-40">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="max-w-3xl">
              <p className="lp3-eyebrow">calculadora aberta</p>
              <h2 className="lp3-section-title mt-4">Veja a estimativa do trabalho manual.</h2>
              <p className="mt-5 max-w-xl text-lg text-[var(--lp-muted)]">
                Ajuste as duas variáveis. A premissa usada no cálculo fica visível na própria tela.
              </p>
            </div>
            <div data-lp-reveal className="mt-14">
              <ManualCostCalculator signupUrl={SIGNUP_URL} />
            </div>
          </div>
        </section>

        <section id="planos" className="border-t border-[var(--lp-line)] py-28 md:py-40">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp-reveal className="mx-auto max-w-2xl text-center">
              <p className="lp3-eyebrow">planos</p>
              <h2 className="lp3-section-title mt-4">Escolha o formato da sua operação.</h2>
              <p className="mt-5 text-lg text-[var(--lp-muted)]">Compare os recursos publicados e avance sem fidelidade.</p>
            </div>

            <div className="mt-16 grid items-stretch gap-5 md:grid-cols-3">
              {PLANS.map((plan) => (
                <article
                  key={plan.name}
                  data-lp-zoom
                  className={`lp3-bento-card relative flex flex-col p-8 ${plan.featured ? "lp3-bento-card-cobalt" : ""}`}
                >
                  {plan.featured ? <span className="lp3-plan-label">plano intermediário</span> : null}
                  <h3 className="text-2xl font-bold tracking-tight">{plan.name}</h3>
                  <p className="mt-2 text-sm text-[var(--lp-muted)]">{plan.who}</p>
                  <p className="mt-7 flex items-baseline gap-1.5">
                    <span className="lp3-mono text-xs text-[var(--lp-muted)]">R$</span>
                    <span className="font-display text-6xl font-bold leading-none tracking-tight">{plan.price}</span>
                    <span className="lp3-mono text-xs text-[var(--lp-muted)]">/mês</span>
                  </p>
                  <ul className="mt-8 flex-1 space-y-3 border-t border-[var(--lp-line)] pt-7">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm leading-snug">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-700" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <a href={SIGNUP_URL} className={`lp3-btn mt-8 justify-center text-sm ${plan.featured ? "lp3-btn-accent" : "lp3-btn-ghost"}`}>
                    Começar com {plan.name}
                  </a>
                </article>
              ))}
            </div>

            <div data-lp-reveal className="lp3-card mt-14 grid gap-6 p-8 md:grid-cols-[auto_1fr] md:items-center md:p-10">
              <p className="font-display text-6xl font-bold text-cobalt-700">30</p>
              <div>
                <h3 className="text-xl font-bold">dias de garantia incondicional</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--lp-muted)]">
                  Consulte os termos da garantia e as condições vigentes antes da contratação.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-[var(--lp-line)] py-28 md:py-40">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div data-lp-reveal>
              <p className="lp3-eyebrow">dúvidas</p>
              <h2 className="lp3-section-title mt-4">Antes de começar.</h2>
              <a href={WHATSAPP_URL} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold hover:text-cobalt-700">
                <WhatsAppIcon className="h-4 w-4 text-[var(--lp-whatsapp)]" aria-hidden /> Perguntar agora
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <div data-lp-reveal>
              {FAQ.map(([question, answer]) => (
                <details key={question} className="lp3-faq py-6">
                  <summary className="flex items-center justify-between gap-4">
                    <span className="text-lg font-bold md:text-xl">{question}</span>
                    <span className="lp3-faq-x text-2xl font-light" aria-hidden>+</span>
                  </summary>
                  <p className="mt-4 max-w-2xl leading-relaxed text-[var(--lp-muted)]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp3-dark py-32 text-center md:py-44">
          <div className="mx-auto max-w-4xl px-5">
            <p data-lp-reveal className="lp3-mono text-[10px] text-[var(--lp-accent)]">{BRAND.tagline}</p>
            <h2 data-lp-reveal className="mt-6 text-balance font-display text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.02] tracking-[-0.04em]">
              Comece com uma campanha real da sua loja.
            </h2>
            <div data-lp-reveal className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={SIGNUP_URL} className="lp3-btn lp3-btn-accent">Começar agora <ArrowRight className="h-4 w-4" aria-hidden /></a>
              <a href={WHATSAPP_URL} className="lp3-btn lp3-btn-ghost-paper">
                <WhatsAppIcon className="h-4 w-4 text-[var(--lp-accent)]" aria-hidden /> Falar no WhatsApp
              </a>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--lp-line)] bg-[var(--lp-paper-2)] py-12">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 text-center sm:flex-row sm:text-left">
            <div>
              <Logo className="text-xl text-volt-950" />
              <p className="mt-2 text-xs text-[var(--lp-muted)]">{BRAND.functionalLine}</p>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--lp-muted)]" aria-label="Links do rodapé">
              <a href="/login">Entrar</a><a href={SIGNUP_URL}>Criar conta</a><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a>
            </nav>
            <p className="text-xs text-[var(--lp-muted)]">© {new Date().getFullYear()} {BRAND.name}</p>
          </div>
        </footer>

        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-volt-800 bg-volt-950 p-3 sm:hidden">
          <a href={SIGNUP_URL} className="lp3-btn lp3-btn-accent flex-1 justify-center py-3 text-sm">Começar agora <ArrowRight className="h-4 w-4" aria-hidden /></a>
          <a href={WHATSAPP_URL} aria-label="Falar no WhatsApp" className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] border border-paper-0/25">
            <WhatsAppIcon className="h-5 w-5 text-[var(--lp-accent)]" aria-hidden />
          </a>
        </div>

        <LpFx />
      </main>
    </div>
  );
}
