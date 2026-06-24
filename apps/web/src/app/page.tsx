import Link from "next/link";
import {
  MessageCircle,
  ShieldCheck,
  Rocket,
  ShoppingBag,
  BarChart3,
  Megaphone,
  Gift,
  Clock,
  RotateCcw,
  Check,
  ArrowRight,
  Flame,
  Smartphone,
  Zap,
} from "lucide-react";

export const metadata = {
  title: "HUBFLOW — Lote seus grupos de WhatsApp e venda mais, no automático",
  description:
    "Atraia revendedoras novas, dispare ofertas pros seus grupos e veja quem comprou e quem sumiu. Feito para atacadista de moda. Conecta no seu WhatsApp em 2 minutos.",
};

const SALES_CTA_URL = process.env.NEXT_PUBLIC_SALES_WHATSAPP_URL || "/signup";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="font-semibold tracking-tight text-slate-900">HUBFLOW</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-brand-500">WhatsApp Growth OS</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="#planos" className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 sm:inline">
              Planos
            </a>
            <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-800">
              Entrar
            </Link>
            <Cta href="/signup" small>
              Criar conta
            </Cta>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0b0718] text-white">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#15102b] via-[#1b1340] to-[#2a1d63]" />
        <div className="dz-grid-dark pointer-events-none absolute inset-0" />
        <div className="dz-aurora pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-brand-500/40 blur-[120px]" />
        <div className="dz-aurora-slow pointer-events-none absolute -bottom-32 left-1/5 h-80 w-80 rounded-full bg-emerald-500/20 blur-[130px]" />
        <div className="dz-aurora pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-fuchsia-500/15 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 text-center sm:py-28">
          <span className="dz-border-glow inline-flex items-center gap-2 rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="dz-pulse-glow h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Feito para atacadista de moda — Brás, Madrugada, Mega Moda
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Encha seus grupos de revendedora nova e venda todo dia —{" "}
            <span className="dz-shimmer">no piloto automático, do seu celular</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-white/70">
            O HUBFLOW conecta o SEU WhatsApp, traz revendedora nova, dispara suas ofertas e mostra
            quem comprou e quanto você vendeu. Tudo simples, do jeito do lojista — sem planilha, sem gestor caro.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={SALES_CTA_URL} big>
              Quero encher meus grupos e vender mais
            </Cta>
            <a href="#como-funciona" className="text-sm font-medium text-white/70 hover:text-white">
              Ver como funciona ↓
            </a>
          </div>
          <p className="mt-5 text-xs text-white/50">
            Conecta em 2 minutos · Funciona no seu número · Seus contatos são seus · Conforme LGPD
          </p>

          <HeroMockup />
        </div>
      </section>

      {/* FAIXA DE CONFIANÇA */}
      <section className="border-b border-slate-100 bg-slate-50/60">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-5 py-6 text-sm sm:grid-cols-3 lg:grid-cols-5">
          {[
            { icon: Rocket, t: "Simples de usar" },
            { icon: Smartphone, t: "Funciona no SEU número" },
            { icon: ShoppingBag, t: "Feito pra atacado" },
            { icon: ShieldCheck, t: "Conforme LGPD" },
            { icon: Check, t: "Seus contatos são seus" },
          ].map(({ icon: Icon, t }) => (
            <div key={t} className="flex items-center gap-2 text-slate-600">
              <Icon className="h-4 w-4 shrink-0 text-brand-500" />
              <span className="font-medium">{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* PROBLEMA */}
      <Section>
        <Eyebrow>O problema</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Você reconhece alguma dessas?
        </h2>
        <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2">
          {[
            "Passa o dia copiando e colando oferta de grupo em grupo, no braço.",
            "Manda oferta e não faz ideia do que funcionou nem de quanto vendeu de verdade.",
            "Não sabe se o grupo está crescendo de verdade ou virou cemitério de revendedora parada.",
            "Revendedora compra uma vez, some, e você nem percebe — dinheiro indo embora calado.",
            "Pra trazer gente nova, depende de indicação na sorte ou de gestor de tráfego caro.",
            "Tem pouco tempo e o operacional come o dia inteiro.",
          ].map((d) => (
            <div key={d} className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white p-4 shadow-card">
              <span className="mt-0.5 text-red-400">✗</span>
              <p className="text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-lg font-medium text-slate-800">
          O problema não é você. É que ninguém te deu uma ferramenta feita pro SEU negócio. Até agora.
        </p>
      </Section>

      {/* SOLUÇÃO — 3 PILARES */}
      <Section muted>
        <Eyebrow>A solução</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Atrair, vender e medir — num lugar só, do seu celular
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-500">
          Você conecta seu WhatsApp e o sistema faz o trabalho pesado: traz gente nova, dispara no ritmo
          seguro, lembra quem sumiu de voltar a comprar e mostra se o negócio está crescendo.
        </p>
        <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
          <Pillar icon={Rocket} title="Atrair" accent="from-brand-500 to-brand-700">
            Encha o grupo de revendedora nova com anúncio pronto e indicação premiada.
          </Pillar>
          <Pillar icon={ShoppingBag} title="Vender" accent="from-emerald-500 to-emerald-700">
            Dispare ofertas pra todos os grupos com um toque e venda no automático.
          </Pillar>
          <Pillar icon={BarChart3} title="Medir" accent="from-orange-500 to-orange-600">
            Veja num toque quem comprou, quem sumiu e quanto você fez.
          </Pillar>
        </div>
      </Section>

      {/* COMO FUNCIONA */}
      <Section id="como-funciona">
        <Eyebrow>Como funciona</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Comece a vender mais em 3 passos
        </h2>
        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-3">
          <Step n={1} title="Conecte seu WhatsApp (2 min)">
            Você lê um QR Code e pronto. É o seu número de sempre, com seus grupos. Sem chip novo, sem nada técnico.
          </Step>
          <Step n={2} title="Seus grupos entram automático">
            Assim que conecta, seus grupos VIP aparecem no painel e você já começa a usar. Sem configurar nada complicado.
          </Step>
          <Step n={3} title="Atraia, dispare e acompanhe">
            Traga revendedora nova com anúncio e indicação, dispare suas ofertas com um toque e veja quem comprou e quem reativar.
          </Step>
        </div>
      </Section>

      {/* FEITO PRO LOJISTA — simplicidade (seção própria) */}
      <section className="relative overflow-hidden bg-[#0b0718] py-20 text-white">
        <div className="dz-grid-dark pointer-events-none absolute inset-0" />
        <div className="dz-aurora pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-brand-600/30 blur-[120px]" />
        <div className="dz-aurora-slow pointer-events-none absolute -right-10 bottom-0 h-72 w-72 rounded-full bg-emerald-500/15 blur-[130px]" />
        <div className="relative mx-auto max-w-5xl px-5">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
              <Smartphone className="h-3.5 w-3.5" /> Feito pra celular
            </span>
            <h2 className="mx-auto mt-5 max-w-3xl text-2xl font-bold tracking-tight sm:text-3xl">
              Feito pra quem entende de moda — não de tecnologia.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/70">
              Se você sabe usar o WhatsApp, sabe usar o HUBFLOW. Tudo no celular, em português de
              gente, com modelos prontos e botões grandes. Nada de planilha, nada de tela cheia de gráfico.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2">
            {[
              ["Conecta em 2 minutos", "Você lê um QR Code e pronto. É o seu número de sempre, com seus grupos."],
              ["Modelos prontos", "Oferta, lançamento, reativação: escolhe um modelo e dispara. Sem travar pensando no texto."],
              ["Tudo num lugar só", "Atrair, vender e medir na mesma tela. Você não precisa de cinco apps."],
              ["Suporte de gente", "Dúvida? Fala no WhatsApp com quem entende de atacado, não com robô."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="flex items-center gap-2 font-semibold text-white">
                  <Check className="h-4 w-4 text-emerald-400" /> {t}
                </p>
                <p className="mt-1 text-sm text-white/60">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ATRAIR — diferencial */}
      <Section muted>
        <div className="mx-auto max-w-4xl text-center">
          <Eyebrow>Atrair gente nova</Eyebrow>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Não basta vender pra quem já está no grupo. A gente enche seu grupo de gente nova.
          </h2>
          <p className="mt-3 text-slate-500">
            A maioria das ferramentas só dispara mensagem. O HUBFLOW traz revendedora nova todo mês,
            de dois jeitos que não dependem de sorte.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
          <BigFeature icon={Megaphone} title="Anúncio pronto pra rodar">
            A gente monta o pacote: link rastreável, texto do anúncio, o público certo e a ideia do
            criativo. Você sobe no Meta e roda — mesmo sem saber nada de tráfego. E vê quanto cada real de
            anúncio te trouxe de revendedora e de venda.
          </BigFeature>
          <BigFeature icon={Gift} title="Indicação Premiada">
            Cada revendedora ganha um link pessoal. Quando ela indica outra que entra, sobe no ranking e
            ganha recompensa. Você cria um exército de gente trazendo gente — a forma mais barata e
            confiável de crescer.
          </BigFeature>
        </div>
      </Section>

      {/* FEATURES → BENEFÍCIOS */}
      <Section>
        <Eyebrow>Benefícios</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Tudo traduzido em dinheiro no seu bolso
        </h2>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-fr">
          <Benefit icon={Zap} title="Venda até dormindo" wide>
            Agende a oferta de amanhã hoje à noite. Toda revendedora nova é recebida com boas-vindas automática.
          </Benefit>
          <Benefit icon={RotateCcw} title="Recupere o dinheiro que some calado">
            O alerta de recompra avisa quem comprou e sumiu, pra você puxar de volta. A venda mais barata que existe.
          </Benefit>
          <Benefit icon={BarChart3} title="Saiba se cresce ou vende">
            Um funil simples: quantas viram o anúncio → entraram → interagiram → compraram → voltaram. Sem número inflado.
          </Benefit>
          <Benefit icon={ShoppingBag} title="Registre a venda em 1 toque">
            Vendeu? Um toque e o pedido fica registrado. No fim do dia você sabe quanto fez, sem planilha.
          </Benefit>
          <Benefit icon={Flame} title="Veja o grupo vivo">
            O sistema mede a conversa no grupo — você sabe quais estão fervendo e quais precisam de um empurrão.
          </Benefit>
          <Benefit icon={Clock} title="Modelos prontos" wide>
            Oferta, lançamento, reativação: tem modelo pronto pra cada situação. É só escolher e disparar.
          </Benefit>
        </div>
      </Section>

      {/* COMPARAÇÃO */}
      <Section muted>
        <Eyebrow>Comparação</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Por que HUBFLOW e não do jeito de sempre?
        </h2>
        <div className="dz-border-glow mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 font-medium text-slate-400"></th>
                <th className="px-3 py-3 text-center font-medium text-slate-400">Na mão</th>
                <th className="px-3 py-3 text-center font-medium text-slate-400">Ferramenta comum</th>
                <th className="px-3 py-3 text-center font-semibold text-brand-700">HUBFLOW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                "Traz revendedora nova de fora",
                "Dispara pros grupos no automático",
                "Mostra quem comprou e quanto vendeu",
                "Avisa quem sumiu pra reativar",
                "Simples pra quem é leigo",
              ].map((row, i) => (
                <tr key={row}>
                  <td className="px-4 py-3 text-slate-700">{row}</td>
                  <td className="px-3 py-3 text-center text-slate-300">✗</td>
                  <td className="px-3 py-3 text-center text-slate-300">{i === 1 ? "≈" : "✗"}</td>
                  <td className="bg-brand-50/40 px-3 py-3 text-center font-semibold text-emerald-600">✓</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* PLANOS */}
      <Section id="planos">
        <Eyebrow>Planos</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Planos que se pagam com uma revendedora reativada
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-500">
          Bem menos que contratar gestor de tráfego (R$800–2.000) ou perder vendas com grupo parado.
          Comece simples e suba quando quiser.
        </p>

        <div className="mx-auto mt-10 grid max-w-5xl items-start gap-5 lg:grid-cols-3">
          <PlanCard
            name="Essencial"
            price="197"
            tagline="Pra quem quer começar"
            features={[
              "1 número de WhatsApp",
              "Até 3 grupos VIP",
              "Envio no ritmo certo",
              "Disparo + agendamento",
              "Boas-vindas + modelos prontos",
              "Funil e saúde do negócio (básico)",
            ]}
          />
          <PlanCard
            name="Growth"
            price="297"
            highlight
            tagline="Pra crescer de verdade · mais escolhido"
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
            tagline="Feito-para-você + estratégia"
            features={[
              "Tudo do Growth +",
              "A gente opera o setup e as ofertas com você",
              "Revisão estratégica mensal 1:1",
              "Prioridade no suporte",
            ]}
          />
        </div>

        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-400">
          Sem fidelidade — cancela quando quiser. Garantia de resultado em 30 dias (veja abaixo).
        </p>
      </Section>

      {/* POR QUE CRIAMOS */}
      <Section muted>
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-card sm:p-10">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand">
            <MessageCircle className="h-6 w-6" />
          </div>
          <p className="text-lg font-medium leading-relaxed text-slate-700 sm:text-xl">
            &ldquo;A gente cansou de ver lojista de atacado trabalhando o dia inteiro no braço, sem saber
            se o grupo crescia ou vendia, e sem um jeito de trazer revendedora nova. O HUBFLOW
            nasceu pra resolver isso — feito por quem vive o atacado de moda, não por quem só entende de
            tecnologia.&rdquo;
          </p>
          <p className="mt-5 text-sm font-semibold text-slate-900">Time HUBFLOW</p>
        </div>
      </Section>

      {/* GARANTIA */}
      <Section>
        <div className="mx-auto max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-brand">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Teste sem risco. O risco é nosso.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Garantia de resultado de <strong>30 dias</strong>: se em um mês você não trouxer revendedora
            nova nem disparar suas ofertas com o número protegido, devolvemos sua mensalidade.
          </p>
          <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" /> Sem fidelidade</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" /> Seus contatos são seus</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-600" /> Suporte no WhatsApp</span>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section muted>
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dúvidas frequentes</h2>
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          {[
            ["Funciona se eu tenho vários grupos?", "Sim. Você gerencia todos os seus grupos VIP num lugar só, dispara pra todos com um toque e vê o resultado de cada um separado."],
            ["Preciso trocar de número?", "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem burocracia."],
            ["É difícil de usar? Não entendo de tecnologia.", "Se você usa WhatsApp, usa o HUBFLOW. É tudo no celular, simples, em português, com modelos prontos e suporte no WhatsApp."],
            ["Como vocês trazem revendedora nova pro meu grupo?", "De dois jeitos: o kit de anúncio (link, texto e público prontos pra rodar no Meta) e a indicação premiada (suas revendedoras indicam outras por um link pessoal, com ranking e recompensa)."],
            ["Meus contatos ficam comigo se eu cancelar?", "Sim. É o seu número, seus contatos são seus. Cancelou? Leva tudo. Sem fidelidade, sem multa."],
            ["Quanto tempo leva pra começar?", "Cerca de 2 minutos pra conectar. O número aquece nos primeiros dias e você já vai usando os recursos enquanto isso."],
            ["E a LGPD? É seguro?", "Sim. Trabalhamos com número mascarado, opt-out e dentro da LGPD. Seguro pra você e pras suas revendedoras."],
          ].map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-slate-200/70 bg-white p-4 shadow-card">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-slate-800">
                {q}
                <span className="text-brand-500 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* CTA FINAL */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#15102b] via-[#1b1340] to-[#2a1d63] py-20 text-white">
        <div className="dz-grid-dark pointer-events-none absolute inset-0" />
        <div className="dz-aurora pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-brand-500/30 blur-[120px]" />
        <div className="dz-aurora-slow pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-emerald-500/15 blur-[130px]" />
        <div className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Seus grupos podem vender mais já essa semana.</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Tem revendedora que comprou e sumiu, grupo parado e oferta que você esqueceu de mandar. O
            HUBFLOW resolve os três. Conecta em 2 minutos, no seu próprio WhatsApp.
          </p>
          <div className="mt-8 flex justify-center">
            <Cta href={SALES_CTA_URL} big>
              Quero encher meus grupos e vender mais
            </Cta>
          </div>
          <p className="mt-5 text-xs text-white/50">
            Teste sem risco · Cancela quando quiser · Conecta em 2 minutos · Seus contatos continuam seus
          </p>
        </div>
      </section>

      {/* CTA fixo no mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <a
          href={SALES_CTA_URL}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30"
        >
          <MessageCircle className="h-4 w-4" /> Quero encher meus grupos
        </a>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-slate-400 sm:flex-row">
          <p className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <MessageCircle className="h-4 w-4" />
            </span>
            HUBFLOW · Feito por quem entende atacado de moda
          </p>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-slate-700">Entrar</Link>
            <a href={SALES_CTA_URL} className="hover:text-slate-700">Falar no WhatsApp</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---- componentes ---- */

// Mockup do painel real (light premium) flutuando no hero — vende o produto visualmente.
function HeroMockup() {
  const funil = [
    { label: "Viram o anúncio", v: "1.842", w: "100%", c: "bg-violet-500" },
    { label: "Entraram no grupo", v: "264", w: "64%", c: "bg-blue-500" },
    { label: "Interagiram", v: "183", w: "44%", c: "bg-orange-500" },
    { label: "Compraram", v: "42", w: "26%", c: "bg-emerald-500" },
  ];
  return (
    <div className="dz-float mx-auto mt-14 max-w-3xl text-left">
      <div className="dz-border-glow rounded-2xl border border-white/10 bg-white p-3 shadow-2xl shadow-black/50">
        {/* hero stat (igual ao painel) */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1b1533] to-[#3a2a7d] p-4">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-500/40 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-white/50">Bom dia! Hoje, no seu negócio:</p>
              <p className="mt-1 flex items-center gap-2 text-base font-bold text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400 ring-4 ring-white/10" /> Seu negócio está crescendo
              </p>
            </div>
            <div className="flex gap-2">
              <MockStat v="+38" l="revendedoras" />
              <MockStat v="12" l="pedidos" />
              <MockStat v="R$4.240" l="na semana" />
            </div>
          </div>
        </div>
        {/* funil */}
        <div className="mt-3 rounded-xl border border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">O caminho até a venda</p>
          <div className="flex flex-col items-center gap-1">
            {funil.map((s) => (
              <div
                key={s.label}
                className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-white ${s.c}`}
                style={{ width: s.w, minWidth: "150px" }}
              >
                <span className="truncate text-[11px] font-medium">{s.label}</span>
                <span className="ml-2 text-sm font-bold tabular-nums">{s.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-white/40">Seu painel — simples, no celular, em português.</p>
    </div>
  );
}

function MockStat({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-center">
      <p className="text-sm font-bold text-white">{v}</p>
      <p className="text-[10px] text-white/50">{l}</p>
    </div>
  );
}

function Cta({ href, children, big, small }: { href: string; children: React.ReactNode; big?: boolean; small?: boolean }) {
  return (
    <a
      href={href}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-emerald-500 font-semibold text-white shadow-[0_10px_34px_-8px_rgba(124,92,255,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_40px_-8px_rgba(16,185,129,0.6)] ${
        big ? "px-7 py-3.5 text-base" : small ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-sm"
      }`}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {children}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-brand-200/70 bg-brand-50/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
      <span className="h-1 w-1 rounded-full bg-brand-500" />
      {children}
    </p>
  );
}

function Section({ children, id, muted }: { children: React.ReactNode; id?: string; muted?: boolean }) {
  return (
    <section id={id} className={`relative overflow-hidden ${muted ? "bg-slate-50/60" : "bg-white"}`}>
      {muted && (
        <div className="dz-aurora-slow pointer-events-none absolute -right-32 top-1/4 h-72 w-72 rounded-full bg-brand-500/10 blur-[120px]" />
      )}
      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:py-20">{children}</div>
    </section>
  );
}

function Pillar({ icon: Icon, title, accent, children }: { icon: typeof Rocket; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="dz-border-glow group rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-brand ${accent}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 text-sm text-slate-500">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="dz-border-glow group relative rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white shadow-brand">
        {n}
      </div>
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 text-sm text-slate-500">{children}</p>
    </div>
  );
}

function BigFeature({ icon: Icon, title, children }: { icon: typeof Rocket; title: string; children: React.ReactNode }) {
  return (
    <div className="dz-border-glow group rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 text-sm text-slate-500">{children}</p>
    </div>
  );
}

function Benefit({ icon: Icon, title, children, wide }: { icon: typeof Rocket; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`dz-border-glow group rounded-xl border border-slate-200/70 bg-white p-5 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover ${wide ? "lg:col-span-2" : ""}`}>
      <Icon className="h-5 w-5 text-brand-500" />
      <p className="mt-2 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{children}</p>
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
      className={`dz-border-glow relative rounded-2xl border bg-white p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover ${
        highlight ? "border-brand-300 ring-2 ring-brand-500/30 lg:-mt-3 lg:pb-8" : "border-slate-200/70"
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-1 text-xs font-semibold text-white shadow-brand">
          Mais escolhido
        </span>
      )}
      <p className="font-semibold text-slate-900">{name}</p>
      <p className="text-xs text-slate-400">{tagline}</p>
      <p className="mt-4 flex items-end gap-1">
        <span className="text-sm text-slate-400">R$</span>
        <span className="text-4xl font-bold tracking-tight text-slate-900">{price}</span>
        <span className="pb-1 text-sm text-slate-400">/mês</span>
      </p>
      <ul className="mt-5 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            {f}
          </li>
        ))}
      </ul>
      <a
        href={SALES_CTA_URL}
        className={`mt-6 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
          highlight
            ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:-translate-y-px"
            : "border border-slate-300 text-slate-700 hover:bg-slate-50"
        }`}
      >
        Falar no WhatsApp
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
