import Image from "next/image";
import { ArrowRight, Check, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";
import { OrderTicker } from "@/components/lp3/order-ticker";
import { PanelMock } from "@/components/lp3/panel-mock";
import { BazarVideo } from "@/components/lp3/video-facade";
import {
  DIFERENCIAL,
  METODO,
  ROTINA,
  SIGNUP_URL,
  TIMESTAMPS,
  WHATSAPP_URL,
} from "@/components/lp3/landing-data";

/* Experiência desktop (≥ md), referência v3 do handoff: é a página anterior com
   4 correções de CRO — manchete nova, um único CTA dominante, régua de prova
   logo abaixo do hero (montada no shell) e planos antes do FAQ. */

export function DesktopHero() {
  return (
    <section className="lp4-mesh relative overflow-hidden pb-28 pt-40">
      <div className="mx-auto w-full max-w-6xl px-5 text-center">
        <p data-lp4-hi className="lp4-mono inline-flex items-center gap-2.5 text-[10px] text-[var(--body)]">
          <span className="lp4-pulse h-1.5 w-1.5 rounded-full bg-[var(--green)]" aria-hidden />
          grupos de whatsapp pra atacado de roupa
        </p>

        <h1 data-lp4-split className="lp4-x mx-auto mt-7 max-w-5xl text-balance text-[clamp(3.2rem,6.4vw,5.5rem)]">
          Grupo cheio, <span className="lp4-green">venda todo dia.</span>
        </h1>

        <p data-lp4-hi className="mx-auto mt-7 max-w-xl text-pretty text-lg leading-relaxed text-[var(--body)]">
          A Girumo lota seus grupos de WhatsApp com revendedores, publica sua oferta em todos de uma
          vez e mostra de qual grupo veio cada venda. Feito por quem levou um atacado de roupa de
          R$ 5 mil a R$ 350 mil por mês fazendo exatamente isso.
        </p>

        {/* um único CTA com peso — o WhatsApp vira link de texto pra não dividir o clique */}
        <div data-lp4-hi className="mt-10 flex items-center justify-center gap-3">
          <a href={SIGNUP_URL} data-lp4-magnetic className="lp4-btn lp4-btn-green">
            Quero encher meus grupos <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={WHATSAPP_URL}
            className="inline-flex items-center gap-2 px-3 text-sm font-semibold text-[var(--green)] transition-colors hover:text-[var(--green-hover)]"
          >
            <WhatsAppIcon className="h-[15px] w-[15px]" aria-hidden /> Falar no WhatsApp
          </a>
        </div>

        <p data-lp4-hi className="lp4-mono mt-8 text-[10px] text-[var(--body)]">
          feito por atacadista, pra atacadista · pague no pix · sem fidelidade
        </p>

        {/* janela dominante — painel de disparo */}
        <div data-lp4-hi className="relative mx-auto mt-16 max-w-4xl">
          <div className="lp4-aurora" aria-hidden />
          <div data-lp4-w data-lp4-tilt data-lp4-float className="lp4-window relative text-left">
            <div className="lp4-chrome">
              <i /><i /><i />
              <span className="lp4-mono ml-2 text-[9px] text-[var(--body)]">girumo · disparo</span>
            </div>
            <PanelMock />
          </div>
          <div className="mt-6 flex justify-center">
            <OrderTicker />
          </div>
        </div>
      </div>
    </section>
  );
}

export function DesktopBody() {
  return (
    <>
      {/* ==================== A ROTINA QUE DÓI ==================== */}
      <section className="py-40">
        <div className="mx-auto max-w-6xl px-5">
          <div data-lp4-r className="max-w-3xl">
            <h2 className="lp4-x text-[clamp(2rem,4.4vw,3.5rem)]">
              Postar na mão custa caro.{" "}
              <span className="text-[var(--body)]">Você só não vê a fatura.</span>
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2" data-lp4-r>
            <div className="rounded-3xl border border-[var(--line)] p-8">
              <p className="lp4-mono text-[10px] text-[var(--body)]">do jeito que tá</p>
              <ul className="mt-6 space-y-4">
                {ROTINA.manual.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-[var(--body)]">
                    <X className="mt-0.5 h-4 w-4 shrink-0 opacity-50" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-[rgba(167,255,47,0.32)] bg-[rgba(96,142,20,0.1)] p-8">
              <p className="lp4-mono flex items-center gap-2 text-[10px] text-[var(--green)]">
                <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden /> com a girumo
              </p>
              <ul className="mt-6 space-y-4">
                {ROTINA.girumo.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] font-medium leading-relaxed">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== A ESTEIRA EM 3 JANELAS ==================== */}
      <section id="metodo-esteira" className="relative border-t border-[var(--line)] py-40">
        <div className="mx-auto max-w-6xl px-5">
          <div data-lp4-r className="max-w-3xl">
            <h2 className="lp4-x text-[clamp(2rem,4.4vw,3.5rem)]">
              Do link ao pedido, <span className="text-[var(--body)]">sem tocar em nada.</span>
            </h2>
          </div>

          <div className="relative mt-16 space-y-24">
            {/* linha da esteira */}
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <path
                data-lp4-path
                d="M 72 2 C 72 18, 28 16, 28 36 C 28 54, 72 50, 72 68 C 72 84, 50 88, 50 99"
                fill="none"
                stroke="rgba(167,255,47,0.5)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* 01 — o link */}
            <div className="relative grid items-center gap-16 md:grid-cols-2">
              <div data-lp4-r>
                <p className="lp4-mono text-[10px] text-[var(--green)]">01 · o link</p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">A página que lota o grupo</h3>
                <p className="mt-3 max-w-md leading-relaxed text-[var(--body)]">
                  Modelo pronto com a sua marca, publicado em minutos. Quem clica no anúncio, na bio
                  ou no story cai direto no grupo certo — e quando lota, o próximo nasce sozinho.
                </p>
              </div>
              <div data-lp4-w className="lp4-window mx-auto w-full max-w-[300px] p-6">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-md bg-[var(--green-deep)]" aria-hidden />
                  <span className="text-xs font-bold">Sua Loja Atacado</span>
                </div>
                <p className="mt-4 text-base font-bold leading-snug">
                  Grade nova toda quarta, antes de todo mundo
                </p>
                <div className="lp4-btn lp4-btn-green mt-4 w-full justify-center py-2.5 text-xs">
                  Entrar no grupo VIP
                </div>
                <p className="lp4-mono mt-2.5 text-center text-[8px] text-[var(--body)]">
                  restam 43 vagas
                </p>
              </div>
            </div>

            {/* 02 — a grade */}
            <div className="relative grid items-center gap-16 md:grid-cols-2">
              <div data-lp4-w className="lp4-window order-2 mx-auto w-full max-w-[340px] p-6 md:order-1">
                <p className="rounded-lg bg-[rgba(242,241,234,0.04)] px-3.5 py-2.5 text-xs">
                  Grade nova 214 — 40 peças. Manda “EU QUERO”.
                </p>
                <div className="mt-3 space-y-1.5">
                  {["VIP 01", "VIP 02", "VIP 03"].map((g) => (
                    <div key={g} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-1.5">
                      <span className="lp4-mono text-[8px] text-[var(--body)]">{g}</span>
                      <Check className="h-3 w-3 text-[var(--green)]" aria-hidden />
                    </div>
                  ))}
                </div>
              </div>
              <div data-lp4-r className="order-1 md:order-2">
                <p className="lp4-mono text-[10px] text-[var(--green)]">02 · a grade</p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">Um clique posta em todos</h3>
                <p className="mt-3 max-w-md leading-relaxed text-[var(--body)]">
                  Escreva uma vez, escolha os grupos e dispare — ou deixe agendado pro horário em que
                  o revendedor monta o pedido. Texto, foto, tabela, áudio.
                </p>
              </div>
            </div>

            {/* 03 — o pedido */}
            <div className="relative grid items-center gap-16 md:grid-cols-2">
              <div data-lp4-r>
                <p className="lp4-mono text-[10px] text-[var(--green)]">03 · o pedido</p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight">Cada venda volta com origem</h3>
                <p className="mt-3 max-w-md leading-relaxed text-[var(--body)]">
                  O painel mostra de qual grupo e de qual anúncio veio cada pedido. Verba vai pro
                  canal que vende — decisão com número, não com achismo.
                </p>
              </div>
              <div data-lp4-w className="lp4-window mx-auto w-full max-w-[340px] p-6">
                {[
                  ["Marina S.", "R$ 186", "anúncio"],
                  ["Cleide R.", "R$ 342", "grupo vip 12"],
                  ["Ana Paula", "R$ 518", "story"],
                ].map(([n, v, o]) => (
                  <div key={n} className="mb-2 flex items-center justify-between rounded-xl border border-[var(--line)] px-4 py-2.5 last:mb-0">
                    <span className="text-xs font-semibold">{n}</span>
                    <span className="lp4-mono text-[9px] text-[var(--green)]">{v}</span>
                    <span className="lp4-mono text-[8px] text-[var(--body)]">{o}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PROVA MEGA STOCK ==================== */}
      <section id="prova" className="border-t border-[var(--line)] py-40">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-12 lg:grid-cols-[380px_1fr] lg:gap-20">
            <div data-lp4-r className="order-2 mx-auto w-full max-w-[340px] lg:order-1">
              <BazarVideo />
              <p className="lp4-mono mt-3 text-center text-[9px] text-[var(--body)]">
                bazar mega stock · evento avisado nos grupos
              </p>
            </div>

            <div className="order-1 lg:order-2">
              <p data-lp4-r className="lp4-mono text-[10px] text-[var(--body)]">
                goiânia · região da 44 · história real
              </p>
              <h2 data-lp4-r className="lp4-x mt-5 text-[clamp(2rem,4.4vw,3.5rem)]">
                A gente levou a Mega Stock de R$ 5 mil a{" "}
                <span className="lp4-green">R$ 350 mil</span> por mês.
              </h2>
              <p data-lp4-r className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--body)]">
                Atacado de roupa infantil, balcão na 44, galpão de 800 m² e tudo feito na mão até
                cansar. A virada foi transformar o grupo de WhatsApp em canal de venda — página de
                captação enchendo grupo, novidade postada cedo, pedido rastreado. A Girumo é essa
                operação virando produto. Agora ela é sua.
              </p>

              <dl data-lp4-r className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
                <div>
                  <dt className="lp4-x text-3xl md:text-4xl">
                    R$ <span data-lp4-c data-to="350">350</span> mil
                  </dt>
                  <dd className="lp4-mono mt-1.5 text-[9px] text-[var(--body)]">por mês</dd>
                </div>
                <div>
                  <dt className="lp4-x text-3xl md:text-4xl">
                    <span data-lp4-c data-to="12000" data-sep>12.000</span>
                  </dt>
                  <dd className="lp4-mono mt-1.5 text-[9px] text-[var(--body)]">revendedores</dd>
                </div>
                <div>
                  <dt className="lp4-x text-3xl md:text-4xl">
                    <span data-lp4-c data-to="50">50</span>+
                  </dt>
                  <dd className="lp4-mono mt-1.5 text-[9px] text-[var(--body)]">grupos ativos</dd>
                </div>
                <div>
                  <dt className="lp4-x text-3xl md:text-4xl">
                    <span data-lp4-c data-to="20">20</span> mil
                  </dt>
                  <dd className="lp4-mono mt-1.5 text-[9px] text-[var(--body)]">peças em 2 dias</dd>
                </div>
              </dl>

              <p data-lp4-r className="lp4-mono mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[9px] text-[var(--body)] opacity-80">
                {TIMESTAMPS.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </p>
            </div>
          </div>

          {/* provas reais — equipe, treinamento e os grupos no WhatsApp */}
          <div className="mt-20">
            <p data-lp4-r className="lp4-mono text-center text-[10px] text-[var(--body)]">
              a operação por trás dos números
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ["/lp3/team-a.webp", "Equipe da Mega Stock reunida no galpão em Goiânia", "equipe · galpão em goiânia"],
                ["/lp3/team-b.webp", "Time completo da Mega Stock reunido no galpão durante treinamento", "o time completo"],
                ["/lp3/team-c.webp", "Treinamento de vendas da equipe da Mega Stock", "treinamento de vendas"],
              ].map(([src, alt, cap]) => (
                <figure
                  key={src}
                  data-lp4-photo
                  className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-[var(--line)]"
                >
                  <Image src={src} alt={alt} fill className="object-cover" sizes="33vw" />
                  <figcaption className="lp4-mono absolute bottom-3 left-3 rounded-full bg-[rgba(7,17,20,0.72)] px-3 py-1 text-[8px] text-[var(--display)] backdrop-blur">
                    {cap}
                  </figcaption>
                </figure>
              ))}
            </div>

            {/* grupos reais */}
            <div className="mt-4 grid items-center gap-8 rounded-3xl border border-[var(--line)] bg-[var(--bg-2)] p-7 sm:grid-cols-[1fr_auto] md:p-10">
              <div>
                <h3 className="lp4-x text-2xl md:text-3xl">
                  Mais de 50 grupos, <span className="lp4-green">no WhatsApp de verdade.</span>
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--body)]">
                  Print real da operação — dá pra ver o grupo “Mega stock Goiânia #51”. Nenhum número
                  inventado: eram dezenas de grupos com milhares de revendedores dentro.
                </p>
              </div>
              <div className="flex justify-center gap-4">
                {[
                  ["/lp3/grp-1.webp", "Lista de grupos Mega Stock Atacado no WhatsApp"],
                  ["/lp3/grp-2.webp", "Grupos Mega Stock Goiânia numerados até 51"],
                ].map(([src, alt]) => (
                  <figure
                    key={src}
                    data-lp4-photo
                    className="relative aspect-[76/165] w-[124px] shrink-0 overflow-hidden rounded-2xl border border-[var(--hairline)] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]"
                  >
                    <Image src={src} alt={alt} fill className="object-cover object-top" sizes="124px" />
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== MÉTODO ==================== */}
      <section id="metodo" className="border-t border-[var(--line)] py-40">
        <div className="mx-auto max-w-6xl px-5">
          <div data-lp4-r className="max-w-3xl">
            <h2 className="lp4-x text-[clamp(2rem,4.4vw,3.5rem)]">
              O jeito Mega Stock de vender,{" "}
              <span className="text-[var(--body)]">do link ao evento.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg text-[var(--body)]">
              Os quatro movimentos que a gente repetia toda semana — e que a ferramenta executa com
              você.
            </p>
          </div>
          <div className="mt-14">
            {METODO.map((m) => (
              <div key={m.n} data-lp4-r className="group grid gap-10 border-t border-[var(--line)] py-9 md:grid-cols-[140px_260px_1fr] md:items-baseline">
                <span className="lp4-x text-6xl text-[rgba(242,241,234,0.16)] transition-colors duration-500 group-hover:text-[rgba(167,255,47,0.7)]" aria-hidden>
                  {m.n}
                </span>
                <h3 className="text-xl font-bold tracking-tight">{m.title}</h3>
                <p className="max-w-xl leading-relaxed text-[var(--body)]">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== DISPARADOR GENÉRICO × GIRUMO ==================== */}
      <section id="diferencial" className="border-t border-[var(--line)] py-40">
        <div className="mx-auto max-w-6xl px-5">
          <div data-lp4-r className="max-w-3xl">
            <p className="lp4-mono text-[10px] text-[var(--green)]">por que girumo</p>
            <h2 className="lp4-x mt-4 text-[clamp(2rem,4.4vw,3.5rem)]">
              Um disparador qualquer{" "}
              <span className="text-[var(--body)]">não foi feito pra isso.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg text-[var(--body)]">
              Ferramenta genérica só manda mensagem. A Girumo foi desenhada pra como o atacado de
              moda vende de verdade — do grupo que lota ao pedido rastreado.
            </p>
          </div>

          <div className="mt-14 overflow-hidden rounded-3xl border border-[var(--line)]">
            <div className="grid grid-cols-[1.3fr_1fr_1fr]">
              <div aria-hidden />
              <div className="px-6 py-5">
                <span className="lp4-mono text-[10px] text-[var(--body)]">disparador genérico</span>
              </div>
              <div className="border-l border-[rgba(167,255,47,0.28)] bg-[rgba(96,142,20,0.1)] px-7 py-5">
                <span className="lp4-mono flex items-center gap-2 text-[10px] text-[var(--green)]">
                  <WhatsAppIcon className="h-3.5 w-3.5" aria-hidden /> girumo
                </span>
              </div>
            </div>

            {DIFERENCIAL.map((row) => (
              <div
                key={row.feat}
                data-lp4-r
                className="grid grid-cols-[1.3fr_1fr_1fr] border-t border-[var(--line)] transition-colors duration-300 hover:bg-[rgba(242,241,234,0.02)]"
              >
                <div className="px-7 py-6">
                  <span className="text-[15px] font-bold tracking-tight">{row.feat}</span>
                </div>
                <div className="flex items-start gap-2.5 border-l border-[var(--line)] px-6 py-6">
                  <X className="mt-0.5 h-4 w-4 shrink-0 opacity-45" aria-hidden />
                  <span className="text-sm leading-relaxed text-[var(--body)]">{row.generic}</span>
                </div>
                <div className="flex items-start gap-2.5 border-l border-[rgba(167,255,47,0.28)] bg-[rgba(96,142,20,0.1)] px-7 py-6">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" aria-hidden />
                  <span className="text-sm font-medium leading-relaxed">{row.hub}</span>
                </div>
              </div>
            ))}
          </div>

          <p data-lp4-r className="lp4-mono mt-6 text-center text-[9px] text-[var(--body)]">
            mesma tela do seu whatsapp de sempre · sem chip novo, sem app extra
          </p>
        </div>
      </section>
    </>
  );
}

export function DesktopFecho() {
  return (
    <section className="border-t border-[var(--line)] py-44 text-center">
      <div className="mx-auto max-w-4xl px-5">
        <h2 data-lp4-r className="lp4-x text-balance text-[clamp(2.4rem,6vw,4.8rem)]">
          Seu próximo grupo cheio começa com <span className="lp4-green">um link.</span>
        </h2>
        <p data-lp4-r className="mx-auto mt-6 max-w-md text-lg text-[var(--body)]">
          Conecte seu WhatsApp em 2 minutos e veja a esteira trabalhar. Pague no Pix, com 7 dias pra desistir.
        </p>
        <div data-lp4-r className="mt-10 flex items-center justify-center gap-3">
          <a href={SIGNUP_URL} className="lp4-btn lp4-btn-green">
            Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href={WHATSAPP_URL} className="lp4-btn lp4-btn-ghost">
            <WhatsAppIcon className="h-4 w-4 text-[var(--green)]" aria-hidden /> Falar no WhatsApp
          </a>
        </div>
        <div data-lp4-r className="mt-12 flex justify-center">
          <OrderTicker />
        </div>
      </div>
    </section>
  );
}
