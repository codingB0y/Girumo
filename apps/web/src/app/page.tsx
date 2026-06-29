import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Gift,
  Megaphone,
  MessageCircle,
  Rocket,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";
import { FlowVisual } from "@/components/landing/flow-visual";
import { Counter, Reveal } from "@/components/landing/interactive";

export const metadata = {
  title: "HubFlow — Do grupo bagunçado ao canal que vende sozinho",
  description:
    "Pare de vender no escuro pelo WhatsApp. O HubFlow põe método nos seus grupos: atrai gente nova, dispara no automático e mostra quanto você vendeu. Conecta em 2 minutos.",
};

/* Ação primária = criar conta. Secundária = WhatsApp de vendas. */
const SIGNUP_URL = "/signup";
const WHATSAPP_URL = process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL || "/signup";

/* ⚠️ PROVA REAL — SUBSTITUIR antes de publicar. Valores em [colchetes] são placeholders. */
const PROOF = {
  quote:
    "[Depoimento real: o que mudou no dia a dia e nas vendas depois do HubFlow — 2 ou 3 frases, com a voz do cliente.]",
  name: "[Nome do cliente]",
  store: "[Loja] · [Cidade–UF]",
  stats: [
    { value: 0, prefix: "+", suffix: "", label: "[gente nova / mês]" },
    { value: 0, prefix: "R$ ", suffix: "", label: "[faturamento / semana]" },
    { value: 0, prefix: "", suffix: "%", label: "[conversão]" },
  ],
};

const TENSIONS = [
  "Você dispara a oferta e não sabe o que vendeu de verdade.",
  "O grupo cresce ou virou cemitério de gente parada? No chute.",
  "Cliente compra uma vez, some — e ninguém puxa de volta.",
];

export default function LandingPage() {
  return (
    <div className="font-body min-h-screen bg-bruma text-breu">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-breu/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo wordmarkClassName="text-white" />
          <div className="flex items-center gap-4">
            <a href="#planos" className="hidden text-sm text-bruma/60 hover:text-white sm:inline">
              Planos
            </a>
            <Link href="/login" className="text-sm text-bruma/60 hover:text-white">
              Entrar
            </Link>
            <Cta href={SIGNUP_URL} size="sm">
              Criar conta
            </Cta>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden bg-breu text-white">
        <div className="hf-breathe pointer-events-none absolute -right-32 top-0 h-[34rem] w-[34rem] rounded-full bg-iris/20 blur-[130px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 sm:py-28 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="font-data inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-wider text-bruma/70">
              <span className="h-1.5 w-1.5 rounded-full bg-iris" />
              Vendas no atacado, pelo WhatsApp
            </span>
            <h1 className="font-display mt-6 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              Do grupo bagunçado ao{" "}
              <span className="hf-gradient-text">canal que vende sozinho.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-bruma/70">
              Chega de copiar oferta de grupo em grupo e vender no escuro. O HubFlow põe método no
              seu WhatsApp — atrai gente nova, dispara no automático e mostra quanto entrou.
            </p>
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Cta href={SIGNUP_URL} size="lg">
                Criar conta
              </Cta>
              <a
                href={WHATSAPP_URL}
                className="inline-flex items-center gap-2 px-2 py-2 text-sm text-bruma/70 transition hover:text-white"
              >
                <MessageCircle className="h-4 w-4 text-iris-claro" /> Falar no WhatsApp
              </a>
            </div>
            <p className="font-data mt-7 text-xs uppercase tracking-wider text-bruma/45">
              Conecta em 2 min · Seu número · Seus contatos são seus · LGPD
            </p>
          </div>
          <FlowVisual className="mx-auto w-full max-w-md lg:max-w-none" />
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="border-y border-white/5 bg-breu-2 text-white">
        <div className="mx-auto max-w-4xl px-5 py-14 text-center">
          <p className="font-data text-xs uppercase tracking-[0.3em] text-iris-claro/80">
            O fluxo que vende
          </p>
          <p className="font-editorial mt-4 text-3xl italic leading-tight sm:text-4xl">
            Menos correria. Mais vendas. No controle.
          </p>
        </div>
      </section>

      {/* ============ PROBLEMA ============ */}
      <section className="bg-bruma">
        <div className="mx-auto max-w-4xl px-5 py-20 sm:py-28">
          <Eyebrow n="01">O ponto cego</Eyebrow>
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.05]">
            Vender no WhatsApp não devia ser no escuro.
          </h2>
          <div className="mt-12 border-t border-breu/10">
            {TENSIONS.map((d, i) => (
              <Reveal key={d} delay={i * 80}>
                <div className="group flex items-start gap-6 border-b border-breu/10 py-7">
                  <span className="font-data pt-1.5 text-sm tabular-nums text-iris/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-xl text-aco transition group-hover:translate-x-1 group-hover:text-breu sm:text-2xl">
                    {d}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="font-editorial mt-12 max-w-xl text-2xl italic leading-snug sm:text-3xl">
            O problema não é você. É não ter método.
          </p>
        </div>
      </section>

      {/* ============ MÉTODO ============ */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="max-w-2xl">
            <Eyebrow n="02">O método</Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.05]">
              Um fluxo, três movimentos.
            </h2>
            <p className="mt-5 text-aco">
              Você conecta o WhatsApp lendo um QR Code — em 2 minutos. O sistema cuida do peso:
              traz gente nova, dispara no ritmo certo e te mostra o número.
            </p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-breu/10 bg-breu/10 md:grid-cols-3">
            <Movement n="01" icon={Rocket} title="Atrair">
              Enche o grupo de gente nova — com anúncio pronto pra rodar e indicação premiada.
            </Movement>
            <Movement n="02" icon={Send} title="Vender">
              Dispara a oferta pra todos os grupos com um toque, no ritmo seguro pro seu número.
            </Movement>
            <Movement n="03" icon={BarChart3} title="Medir">
              Mostra quem comprou, quem sumiu e quanto entrou. Em português, sem planilha.
            </Movement>
          </div>
        </div>
      </section>

      {/* ============ CAPACIDADES (bento) ============ */}
      <section className="bg-bruma">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <Eyebrow n="03">Na prática</Eyebrow>
          <h2 className="font-display max-w-2xl text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.05]">
            O que o WhatsApp sozinho não te dá.
          </h2>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Bento icon={Send} title="Dispare pra todos com 1 toque" dark className="lg:col-span-4">
              Uma oferta, todos os grupos, no ritmo seguro pro seu número não cair. Agende hoje a
              oferta de amanhã e durma tranquilo.
            </Bento>
            <Bento icon={RotateCcw} title="Recompra automática" className="lg:col-span-2">
              O alerta puxa de volta quem comprou e sumiu — a venda mais barata que existe.
            </Bento>
            <Bento icon={BarChart3} title="Funil sem número inflado" className="lg:col-span-2">
              Quem viu, entrou, comprou e voltou. O caminho real até a venda.
            </Bento>
            <Bento icon={Activity} title="Saúde do negócio num olhar" dark className="lg:col-span-2">
              Cresce ou parou? O painel te diz, em português, sem você virar analista.
            </Bento>
            <Bento icon={Clock} title="Modelos prontos" className="lg:col-span-1">
              Oferta, lançamento, reativação. Escolhe e dispara.
            </Bento>
            <Bento icon={Sparkles} title="Boas-vindas automática" className="lg:col-span-1">
              Cada novidade que entra já é recebida sozinha.
            </Bento>
          </div>
        </div>
      </section>

      {/* ============ DIFERENCIAL ============ */}
      <section className="bg-breu text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <Eyebrow n="04" dark>
            O diferencial
          </Eyebrow>
          <h2 className="font-display max-w-3xl text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.05]">
            Outras ferramentas só disparam. A gente enche seu grupo.
          </h2>
          <p className="mt-5 max-w-xl text-bruma/60">
            Trazer gente nova todo mês sem depender de sorte — de dois jeitos que se pagam.
          </p>
          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            <DarkFeature icon={Megaphone} title="Anúncio pronto pra rodar">
              A gente monta o pacote: link rastreável, texto, público e a ideia do criativo. Você
              sobe no Meta e roda — mesmo sem saber nada de tráfego — e vê quanto cada real virou
              gente nova e venda.
            </DarkFeature>
            <DarkFeature icon={Gift} title="Indicação premiada">
              Cada cliente ganha um link pessoal. Indicou alguém que entrou, sobe no ranking e ganha
              recompensa. Um exército de gente trazendo gente — o jeito mais barato de crescer.
            </DarkFeature>
          </div>
        </div>
      </section>

      {/* ============ PROVA ============ */}
      <section className="bg-breu text-white">
        <div className="mx-auto max-w-6xl border-t border-white/10 px-5 py-20 sm:py-28">
          <Eyebrow n="05" dark>
            Quem botou método
          </Eyebrow>
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <blockquote className="font-editorial text-3xl italic leading-snug sm:text-4xl">
                “{PROOF.quote}”
              </blockquote>
              <div className="mt-7 flex items-center gap-3">
                {/* TODO: foto real do cliente */}
                <div className="h-11 w-11 shrink-0 rounded-full bg-white/10" aria-hidden />
                <div>
                  <p className="font-medium">{PROOF.name}</p>
                  <p className="font-data text-xs uppercase tracking-wider text-bruma/50">
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
                  <p className="font-data mt-1 text-xs uppercase tracking-wider text-bruma/50">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ PLANOS ============ */}
      <section id="planos" className="bg-bruma">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="max-w-2xl">
            <Eyebrow n="06">Planos</Eyebrow>
            <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.05]">
              Comece onde fizer sentido.
            </h2>
            <p className="mt-5 text-aco">
              Menos que um gestor de tráfego (R$ 800–2.000) ou que o prejuízo de um grupo parado.
              Sobe de plano quando crescer. Sem fidelidade.
            </p>
          </div>
          <div className="mt-14 grid items-start gap-5 lg:grid-cols-3">
            <PlanCard
              name="Essencial"
              price="197"
              tagline="Pra botar pra rodar"
              features={[
                "1 número de WhatsApp",
                "Até 3 grupos VIP",
                "Disparo + agendamento no ritmo certo",
                "Boas-vindas + modelos prontos",
                "Funil e saúde do negócio (básico)",
              ]}
            />
            <PlanCard
              name="Growth"
              price="297"
              highlight
              tagline="Pra crescer de verdade"
              features={[
                "Tudo do Essencial +",
                "Grupos VIP ilimitados",
                "Atrair: kit de anúncio Meta + indicação premiada",
                "Medir completo: recompra, atividade, pedidos",
                "Suporte no WhatsApp",
              ]}
            />
            <PlanCard
              name="Performance Max"
              price="497"
              tagline="A gente opera com você"
              features={[
                "Tudo do Growth +",
                "Setup e ofertas operados junto com você",
                "Revisão estratégica mensal 1:1",
                "Prioridade no suporte",
              ]}
            />
          </div>
          <p className="font-data mt-8 text-center text-xs uppercase tracking-wider text-aco/60">
            Sem fidelidade · Cancela quando quiser · Garantia de 30 dias
          </p>
        </div>
      </section>

      {/* ============ GARANTIA ============ */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:py-28">
          <div className="rounded-3xl border border-sucesso/25 bg-sucesso/[0.06] p-8 text-center sm:p-12">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sucesso text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
              O risco é nosso.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-aco">
              Garantia de <strong className="text-breu">30 dias</strong>: se em um mês você não
              trouxer gente nova nem disparar suas ofertas com o número protegido, devolvemos a
              mensalidade.
            </p>
            <div className="font-data mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs uppercase tracking-wider text-aco">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-sucesso" /> Sem fidelidade
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-sucesso" /> Seus contatos são seus
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-sucesso" /> Suporte de gente
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="bg-bruma">
        <div className="mx-auto max-w-3xl px-5 pb-20 sm:pb-28">
          <Eyebrow n="07">Dúvidas</Eyebrow>
          <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.05]">
            O que costumam perguntar.
          </h2>
          <div className="mt-12 divide-y divide-breu/10 border-y border-breu/10">
            {[
              ["Preciso trocar de número?", "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem burocracia."],
              ["É difícil? Não entendo de tecnologia.", "Se você usa WhatsApp, usa o HubFlow. Tudo no celular, em português, com modelos prontos e suporte de gente."],
              ["Funciona com vários grupos?", "Sim. Você gerencia todos os grupos VIP num lugar só, dispara pra todos com um toque e vê o resultado de cada um."],
              ["Como vocês trazem gente nova pro meu grupo?", "De dois jeitos: o kit de anúncio pronto pra rodar no Meta e a indicação premiada (seus clientes indicam outros por um link, com ranking e recompensa)."],
              ["Meus contatos ficam comigo se eu cancelar?", "Sim. É o seu número, seus contatos são seus. Cancelou, leva tudo. Sem fidelidade, sem multa."],
              ["E a LGPD? É seguro?", "Sim. Número mascarado, opt-out e dentro da LGPD. Seguro pra você e pra quem está nos seus grupos."],
            ].map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-breu">
                  {q}
                  <span className="font-data shrink-0 text-iris transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-aco">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA FINAL ============ */}
      <section className="relative overflow-hidden bg-breu text-white">
        <div className="hf-breathe pointer-events-none absolute -left-32 -bottom-40 h-[32rem] w-[32rem] rounded-full bg-iris/20 blur-[130px]" />
        <div className="relative mx-auto max-w-3xl px-5 py-28 text-center">
          <h2 className="font-display text-3xl font-extrabold tracking-[-0.035em] sm:text-5xl">
            Seu WhatsApp pode vender mais já essa semana.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-bruma/70">
            Tem oferta que você esqueceu de mandar, grupo parado e cliente que sumiu. O HubFlow
            resolve os três — conecta em 2 minutos, no seu próprio número.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={SIGNUP_URL} size="lg">
              Criar conta
            </Cta>
            <a
              href={WHATSAPP_URL}
              className="inline-flex items-center gap-2 px-2 py-2 text-sm text-bruma/70 transition hover:text-white"
            >
              <MessageCircle className="h-4 w-4 text-iris-claro" /> Falar no WhatsApp
            </a>
          </div>
          <p className="font-data mt-7 text-xs uppercase tracking-wider text-bruma/45">
            Teste sem risco · Cancela quando quiser · Seus contatos continuam seus
          </p>
        </div>
      </section>

      {/* CTA fixo mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-breu/10 bg-bruma/95 p-3 backdrop-blur sm:hidden">
        <a
          href={SIGNUP_URL}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-iris py-3 text-sm font-medium text-white shadow-iris"
        >
          Criar conta <ArrowRight className="h-4 w-4" />
        </a>
        <a
          href={WHATSAPP_URL}
          aria-label="Falar no WhatsApp"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-breu/15 text-breu"
        >
          <MessageCircle className="h-5 w-5" />
        </a>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-breu text-bruma/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 py-10 pb-24 sm:flex-row sm:pb-10">
          <div className="text-center sm:text-left">
            <Logo wordmarkClassName="text-white" />
            <p className="font-data mt-2 text-xs uppercase tracking-wider text-bruma/40">
              O fluxo que vende.
            </p>
          </div>
          <div className="flex gap-5 text-sm">
            <Link href="/login" className="transition hover:text-white">
              Entrar
            </Link>
            <a href={WHATSAPP_URL} className="transition hover:text-white">
              Falar no WhatsApp
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
        "group inline-flex items-center justify-center gap-2 rounded-xl bg-iris font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2",
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
  dark,
}: {
  n?: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={cn(
        "font-data mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.2em]",
        dark ? "text-bruma/50" : "text-aco/70",
      )}
    >
      {n && <span className="text-iris">{n}</span>}
      <span className="h-px w-8 bg-current opacity-40" />
      {children}
    </p>
  );
}

function Movement({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: string;
  icon: typeof Rocket;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group bg-white p-8 transition hover:bg-bruma/40">
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-iris/10 text-iris transition group-hover:bg-iris group-hover:text-white">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-data text-sm tabular-nums text-aco/40">{n}</span>
      </div>
      <p className="font-display mt-6 text-2xl font-bold">{title}</p>
      <p className="mt-2 text-aco">{children}</p>
    </div>
  );
}

function Bento({
  icon: Icon,
  title,
  children,
  dark,
  className,
}: {
  icon: typeof Rocket;
  title: string;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-6 transition",
        dark
          ? "border-white/10 bg-breu text-white"
          : "border-breu/10 bg-white hover:-translate-y-0.5 hover:border-iris/30",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          dark ? "bg-white/10 text-iris-claro" : "bg-iris/10 text-iris",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-display mt-5 text-lg font-bold">{title}</p>
      <p className={cn("mt-1.5 text-sm", dark ? "text-bruma/60" : "text-aco")}>{children}</p>
    </div>
  );
}

function DarkFeature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Rocket;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-iris/40">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-iris/15 text-iris-claro">
        <Icon className="h-5 w-5" />
      </span>
      <p className="font-display mt-5 text-xl font-bold">{title}</p>
      <p className="mt-2 text-bruma/60">{children}</p>
    </div>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  features,
  highlight,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border bg-white p-7 transition",
        highlight
          ? "border-iris/40 shadow-iris lg:-mt-4 lg:pb-9"
          : "border-breu/10 hover:border-iris/30",
      )}
    >
      {highlight && (
        <span className="font-data absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-iris px-3 py-1 text-xs uppercase tracking-wider text-white shadow-iris">
          <Sparkles className="h-3 w-3" /> Mais escolhido
        </span>
      )}
      <p className="font-display text-lg font-bold">{name}</p>
      <p className="text-xs text-aco/70">{tagline}</p>
      <p className="mt-5 flex items-end gap-1">
        <span className="text-sm text-aco">R$</span>
        <span className="font-display text-5xl font-extrabold tracking-[-0.03em]">{price}</span>
        <span className="pb-1.5 text-sm text-aco">/mês</span>
      </p>
      <ul className="mt-6 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-aco">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-sucesso" />
            {f}
          </li>
        ))}
      </ul>
      <a
        href={SIGNUP_URL}
        className={cn(
          "mt-7 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition",
          highlight
            ? "bg-iris text-white shadow-iris hover:-translate-y-0.5 hover:bg-iris-claro"
            : "border border-breu/15 text-breu hover:border-iris hover:text-iris",
        )}
      >
        Criar conta
        <ArrowRight className="h-4 w-4" />
      </a>
      <a
        href={WHATSAPP_URL}
        className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-aco/70 transition hover:text-iris"
      >
        <MessageCircle className="h-3.5 w-3.5" /> Falar no WhatsApp
      </a>
    </div>
  );
}
