import { ArrowRight, Check, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Lp2Fx } from "@/components/lp2/fx";
import { Lp2Nav } from "@/components/lp2/nav";
import { BRAND, BRAND_PRODUCTS, getPublicSiteUrl } from "@/lib/brand";
import "./lp2.css";

export const metadata = {
  title: { absolute: `${BRAND.name} — Operação de grupos no WhatsApp` },
  description: BRAND.description,
  robots: { index: false, follow: false },
};

const SIGNUP_URL = "/signup";
const WHATSAPP_URL =
  process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL ||
  "https://wa.me/5562998191314?text=Ol%C3%A1!%20Quero%20saber%20mais%20sobre%20a%20Girumo.";
const PUBLIC_SITE_LABEL = getPublicSiteUrl().replace(/^https?:\/\//, "");

const ROUTINE = {
  manual: [
    "Copiar a mesma mensagem em várias conversas",
    "Guardar links de grupo em listas paralelas",
    "Reunir origem e resultado depois da campanha",
    "Depender de outra ferramenta para publicar a página",
  ],
  girumo: [
    "Preparar a campanha em um fluxo central",
    "Organizar o destino de cada entrada",
    "Registrar a origem ao longo da jornada",
    "Publicar a página com o sistema de captação",
  ],
};

const METHOD = [
  {
    n: "01",
    title: "Captação",
    body: "A página apresenta a oferta, coleta consentimento e encaminha para o destino configurado pela loja.",
  },
  {
    n: "02",
    title: "Organização",
    body: "Os grupos e campanhas passam a compartilhar uma sequência operacional legível.",
  },
  {
    n: "03",
    title: "Programação",
    body: "Conteúdo, destino e horário ficam no mesmo contexto antes do envio.",
  },
  {
    n: "04",
    title: "Leitura",
    body: "A origem registrada ajuda a operação a decidir a próxima campanha com base nos próprios eventos.",
  },
];

const DIFFERENTIAL = [
  {
    feature: "Página de captação",
    fragmented: "Montada e mantida em outra ferramenta",
    girumo: "Publicada no Girumo Pages",
  },
  {
    feature: "Destino do contato",
    fragmented: "Link escolhido e trocado manualmente",
    girumo: "Destino configurado na operação",
  },
  {
    feature: "Rotina de mensagens",
    fragmented: "Texto, grupo e horário em telas separadas",
    girumo: "Campanha e agenda no mesmo fluxo",
  },
  {
    feature: "Origem",
    fragmented: "Reconstruída depois da ação",
    girumo: "Registrada pelos eventos da campanha",
  },
];

const PLANS = [
  {
    name: "Essencial",
    price: 197,
    description: "Para iniciar a rotina de grupos.",
    features: ["1 número de WhatsApp", "Até 5 grupos", "Texto e imagem", "Agendamento"],
    featured: false,
  },
  {
    name: "Growth",
    price: 297,
    description: "Para operar campanhas recorrentes.",
    features: ["Grupos ilimitados", "Sequência de grupos", "Página de captação", "Agenda semanal", "Origem rastreada"],
    featured: true,
  },
  {
    name: "Operação",
    price: 497,
    description: "Para configurar a rotina com acompanhamento.",
    features: ["Tudo do Growth", "Setup assistido", "Revisão mensal 1:1", "Suporte prioritário"],
    featured: false,
  },
];

const FAQ = [
  ["Preciso trocar de número?", "Não. A operação conecta o número configurado, sem exigir um chip dedicado só para a Girumo."],
  ["Como a página trata o contato?", "O formulário solicita nome, WhatsApp e consentimento LGPD antes de enviar os dados."],
  ["Posso usar uma campanha rastreada?", "Sim. O editor permite apontar a página para uma campanha ou para um grupo configurado."],
  ["Os grupos ficam comigo?", "Os grupos e contatos pertencem à sua operação. Consulte os termos vigentes para detalhes do serviço."],
] as const;

export default function Lp2Page() {
  return (
    <div className="lp4 min-h-screen">
      <main className="w-full max-w-full overflow-x-clip">
        <div className="lp4-grain" aria-hidden />
        <Lp2Nav signupUrl={SIGNUP_URL} />

        <section className="lp4-mesh relative overflow-hidden pb-20 pt-40 md:pb-28">
          <div className="mx-auto w-full max-w-6xl px-5 text-center">
            <p data-lp4-hi className="lp4-mono inline-flex items-center gap-2.5 text-[10px] text-[var(--body)]">
              <span className="h-1.5 w-8 bg-[var(--green)]" aria-hidden />
              comércio por WhatsApp, com cadência operacional
            </p>
            <h1 data-lp4-split className="lp4-x mx-auto mt-7 max-w-5xl text-balance text-[clamp(2.7rem,6.4vw,5.5rem)]">
              Mais grupos rodando. <span className="lp4-green">Menos trabalho repetido.</span>
            </h1>
            <p data-lp4-hi className="mx-auto mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-[var(--body)]">
              {BRAND.description} A interface reúne a sequência comercial sem transformar demonstração em prova de resultado.
            </p>
            <div data-lp4-hi className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={SIGNUP_URL} data-lp4-magnetic className="lp4-btn lp4-btn-green">
                Criar minha campanha <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <a href={WHATSAPP_URL} data-lp4-magnetic className="lp4-btn lp4-btn-ghost">
                <WhatsAppIcon className="h-4 w-4 text-[var(--green)]" aria-hidden /> Falar no WhatsApp
              </a>
            </div>
            <p data-lp4-hi className="lp4-mono mt-8 text-[10px] text-[var(--body)]">
              Pages · Grupos · Campanhas · Agenda · Resultados
            </p>

            <div data-lp4-hi className="mx-auto mt-16 max-w-5xl">
              <div data-lp4-w data-lp4-tilt className="lp4-window text-left">
                <div className="lp4-chrome">
                  <i /><i /><i />
                  <span className="lp4-mono ml-2 text-[9px] text-[var(--body)]">{BRAND.name} · mapa operacional</span>
                </div>
                <div className="lp4-panelfit">
                  <div className="lp4-panelscale">
                    <div className="lp4-panel-heading">
                      <Logo className="text-[28px] text-paper-0" />
                      <span className="lp4-mono text-[10px] text-canvas-100/50">representação de processo</span>
                    </div>
                    <div className="lp4-panel-flow">
                      {[
                        ["01", "CAPTAR", "Girumo Pages"],
                        ["02", "ORGANIZAR", "Girumo Grupos"],
                        ["03", "PROGRAMAR", "Girumo Campanhas + Agenda"],
                        ["04", "ENTENDER", "Girumo Resultados"],
                      ].map(([n, title, product], index) => (
                        <div key={n} className="lp4-panel-node">
                          <span className="lp4-mono text-[12px] text-[var(--green)]">{n}</span>
                          <strong>{title}</strong>
                          <small>{product}</small>
                          {index < 3 ? <ArrowRight className="lp4-panel-arrow" aria-hidden /> : null}
                        </div>
                      ))}
                    </div>
                    <div className="lp4-panel-foot">
                      <span>{PUBLIC_SITE_LABEL}/p/sua-pagina</span>
                      <span>mapa conceitual do fluxo Girumo</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp4-r className="max-w-3xl">
              <p className="lp4-kicker">a rotina que pesa</p>
              <h2 className="lp4-section-title mt-5">O problema não é o WhatsApp. É o trabalho espalhado ao redor dele.</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2" data-lp4-r>
              <article className="lp4-compare-card">
                <p className="lp4-mono text-[10px] text-[var(--body)]">fluxo fragmentado</p>
                <ul className="mt-7 space-y-4">
                  {ROUTINE.manual.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-[var(--body)]">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              </article>
              <article className="lp4-compare-card border-[var(--green)]">
                <p className="lp4-mono text-[10px] text-[var(--green)]">fluxo Girumo</p>
                <ul className="mt-7 space-y-4">
                  {ROUTINE.girumo.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-paper-0">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="metodo-esteira" className="relative border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp4-r className="max-w-3xl">
              <p className="lp4-kicker">a esteira</p>
              <h2 className="lp4-section-title mt-5">Uma entrada. Uma sequência. Um contexto compartilhado.</h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--body)]">
                A linha é uma ilustração do encadeamento entre módulos; ela não representa volume, conversão ou receita.
              </p>
            </div>

            <div className="relative mt-16">
              <svg viewBox="0 0 1000 140" className="absolute inset-x-0 top-14 hidden h-28 w-full md:block" aria-hidden>
                <path data-lp4-path d="M40 70 C210 10 300 130 480 70 S760 20 960 70" fill="none" stroke="var(--green)" strokeWidth="3" />
              </svg>
              <ol className="relative grid gap-4 md:grid-cols-3">
                {[
                  ["A", "Página", "Coleta os dados e o consentimento."],
                  ["B", "Operação", "Organiza grupos, campanha e agenda."],
                  ["C", "Leitura", "Registra a origem para consulta."],
                ].map(([letter, title, description]) => (
                  <li key={letter} data-lp4-r className="lp4-window p-7">
                    <span className="lp4-step-letter">{letter}</span>
                    <h3 className="mt-12 text-2xl font-bold">{title}</h3>
                    <p className="mt-3 text-[var(--body)]">{description}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="prova" className="border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div data-lp4-photo className="lp4-editorial-block order-2 lg:order-1">
              <div data-lp4-parallax data-speed="0.08" className="lp4-editorial-signal">
                sistema, não cenário
              </div>
              <ol className="grid gap-px bg-[var(--line)]">
                {BRAND_PRODUCTS.map((product, index) => (
                  <li key={product} className="grid grid-cols-[52px_1fr] bg-[var(--bg-2)] p-5">
                    <span className="lp4-mono text-[9px] text-[var(--green)]">0{index + 1}</span>
                    <span className="font-semibold text-paper-0">{product}</span>
                  </li>
                ))}
              </ol>
              <p className="border-t border-[var(--line)] p-5 text-xs text-[var(--body)]">
                Quadro editorial de módulos. Nenhuma informação de cliente é exibida.
              </p>
            </div>

            <div className="order-1 lg:order-2">
              <p data-lp4-r className="lp4-kicker">o que é verificável</p>
              <h2 data-lp4-r className="lp4-section-title mt-5">A demonstração apresenta o que o sistema conecta.</h2>
              <p data-lp4-r className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--body)]">
                A demonstração apresenta apenas a identidade, os módulos e o fluxo verificável do produto.
              </p>
              <div data-lp4-r className="mt-10 flex items-end gap-5 border-l-2 border-[var(--green)] pl-6">
                <span className="lp4-x text-7xl text-[var(--green)]">
                  <span data-lp4-c data-to={BRAND_PRODUCTS.length} data-sep>{BRAND_PRODUCTS.length}</span>
                </span>
                <span className="pb-2 text-sm text-[var(--body)]">módulos oficiais conectados no produto</span>
              </div>
            </div>
          </div>
        </section>

        <section id="metodo" className="border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp4-r className="max-w-3xl">
              <p className="lp4-kicker">método operacional</p>
              <h2 className="lp4-section-title mt-5">Quatro movimentos para manter o canal em ordem.</h2>
            </div>
            <ol className="mt-14 border-b border-[var(--line)]">
              {METHOD.map((step) => (
                <li key={step.n} data-lp4-r className="grid gap-4 border-t border-[var(--line)] py-9 md:grid-cols-[140px_260px_1fr] md:items-baseline md:gap-10">
                  <span className="lp4-mono text-[10px] text-[var(--green)]">{step.n}</span>
                  <h3 className="text-2xl font-bold">{step.title}</h3>
                  <p className="leading-relaxed text-[var(--body)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="diferencial" className="border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp4-r className="max-w-3xl">
              <p className="lp4-kicker">por que Girumo</p>
              <h2 className="lp4-section-title mt-5">Menos troca de contexto entre uma tarefa e outra.</h2>
            </div>
            <div data-lp4-w className="lp4-window lp4-scroll-window mt-14">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1fr_1.25fr_1.25fr] border-b border-[var(--line)] bg-[var(--bg)] px-6 py-4 lp4-mono text-[9px] text-[var(--body)]">
                  <span>etapa</span><span>fluxo fragmentado</span><span className="text-[var(--green)]">Girumo</span>
                </div>
                {DIFFERENTIAL.map((row) => (
                  <div key={row.feature} data-lp4-r className="grid grid-cols-[1fr_1.25fr_1.25fr] gap-6 border-b border-[var(--line)] px-6 py-5 last:border-b-0">
                    <strong>{row.feature}</strong><span className="text-[var(--body)]">{row.fragmented}</span><span>{row.girumo}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-lp4-r>
              <p className="lp4-kicker">dúvidas</p>
              <h2 className="lp4-section-title mt-5">Antes de começar.</h2>
              <a href={WHATSAPP_URL} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--green)]">
                Perguntar no WhatsApp <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <div data-lp4-r>
              {FAQ.map(([question, answer]) => (
                <details key={question} className="lp4-faq py-6">
                  <summary className="flex items-center justify-between gap-4">
                    <span className="text-lg font-bold md:text-xl">{question}</span>
                    <span className="lp4-faq-x text-2xl font-light" aria-hidden>+</span>
                  </summary>
                  <p className="mt-4 max-w-2xl leading-relaxed text-[var(--body)]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="border-t border-[var(--line)] py-24 md:py-36">
          <div className="mx-auto max-w-6xl px-5">
            <div data-lp4-r className="mx-auto max-w-2xl text-center">
              <p className="lp4-kicker">planos</p>
              <h2 className="lp4-section-title mt-5">Um plano para cada ritmo de operação.</h2>
              <p className="mt-5 text-[var(--body)]">Compare recursos e limites para escolher o ritmo da sua operação.</p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {PLANS.map((plan) => (
                <article key={plan.name} data-lp4-w className={`lp4-plan-card ${plan.featured ? "is-featured" : ""}`}>
                  {plan.featured ? <span className="lp4-plan-label">plano intermediário</span> : null}
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                  <p className="mt-2 text-sm text-[var(--body)]">{plan.description}</p>
                  <p className="mt-7 flex items-baseline gap-1.5">
                    <span className="lp4-mono text-[10px] text-[var(--body)]">R$</span>
                    <span className="lp4-x text-6xl">{plan.price}</span>
                    <span className="lp4-mono text-[10px] text-[var(--body)]">/mês</span>
                  </p>
                  <ul className="mt-8 flex-1 space-y-3 border-t border-[var(--line)] pt-7">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" aria-hidden /> {feature}
                      </li>
                    ))}
                  </ul>
                  <a href={SIGNUP_URL} className={`lp4-btn mt-8 w-full ${plan.featured ? "lp4-btn-green" : "lp4-btn-ghost"}`}>Começar com {plan.name}</a>
                </article>
              ))}
            </div>
            <div data-lp4-r className="mt-14 grid gap-6 border border-[var(--line)] bg-[var(--bg-2)] p-8 md:grid-cols-[auto_1fr] md:items-center">
              <span className="lp4-x text-7xl text-[var(--green)]">30</span>
              <div><h3 className="text-2xl font-bold">dias de garantia incondicional</h3><p className="mt-2 text-[var(--body)]">Consulte os termos e as condições vigentes antes de contratar.</p></div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--line)] py-28 text-center md:py-40">
          <div className="mx-auto max-w-4xl px-5">
            <p data-lp4-r className="lp4-kicker">{BRAND.tagline}</p>
            <h2 data-lp4-r className="lp4-x mt-6 text-balance text-[clamp(2.5rem,6vw,4.8rem)]">Coloque uma campanha real no fluxo.</h2>
            <p data-lp4-r className="mx-auto mt-6 max-w-lg text-lg text-[var(--body)]">Comece com os dados da sua loja e acompanhe apenas o que a sua própria operação registrar.</p>
            <div data-lp4-r className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={SIGNUP_URL} data-lp4-magnetic className="lp4-btn lp4-btn-green">Começar agora <ArrowRight className="h-4 w-4" aria-hidden /></a>
              <a href={WHATSAPP_URL} className="lp4-btn lp4-btn-ghost"><WhatsAppIcon className="h-4 w-4 text-[var(--green)]" aria-hidden /> Falar no WhatsApp</a>
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--line)] py-12">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 text-center sm:flex-row sm:text-left">
            <div><Logo className="text-xl text-paper-0" /><p className="mt-2 text-xs text-[var(--body)]">{BRAND.functionalLine}</p></div>
            <nav className="flex flex-wrap justify-center gap-6 text-sm text-[var(--body)]" aria-label="Links do rodapé">
              <a href="/login">Entrar</a><a href={SIGNUP_URL}>Criar conta</a><a href="/termos">Termos</a><a href="/privacidade">Privacidade</a>
            </nav>
            <p className="text-xs text-[var(--body)]">© {new Date().getFullYear()} {BRAND.name}</p>
          </div>
        </footer>

        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-[var(--line)] bg-[var(--bg)] p-3 sm:hidden">
          <a href={SIGNUP_URL} className="lp4-btn lp4-btn-green flex-1 py-3 text-sm">Começar agora <ArrowRight className="h-4 w-4" aria-hidden /></a>
          <a href={WHATSAPP_URL} aria-label="Falar no WhatsApp" className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] border border-[var(--hairline)]"><WhatsAppIcon className="h-5 w-5 text-[var(--green)]" aria-hidden /></a>
        </div>

        <Lp2Fx />
      </main>
    </div>
  );
}
