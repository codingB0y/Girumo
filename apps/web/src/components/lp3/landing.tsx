import { Archivo, Martian_Mono } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Lp2Nav } from "@/components/lp3/nav";
import { Lp2Fx } from "@/components/lp3/fx";
import { FirstTouchCookie } from "@/components/analytics/first-touch-cookie";
import { MobileCta } from "@/components/lp3/mobile-cta";
import { ProofMarquee } from "@/components/lp3/proof-marquee";
import {
  DesktopBody,
  DesktopFecho,
  DesktopHero,
} from "@/components/lp3/landing-desktop";
import {
  MobileFecho,
  MobileHero,
  MobileStory,
  MobileTimeline,
} from "@/components/lp3/landing-mobile";
import { Plans } from "@/components/lp3/plans";
import { DEMO_URL, LP3_FAQ, WHATSAPP_URL } from "@/components/lp3/landing-data";
import "@/app/lp3/lp3.css";

export { LP3_FAQ };

/* Sistema tipográfico próprio da /lp3 (sem herança do site, por ordem do Igor):
   Archivo variable (display expandido via font-stretch) + Martian Mono (etiquetas).
   Paleta: volt-carvão + acid (#A7FF2F) da marca Girumo. */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-lp4",
  display: "swap",
});

const martian = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-lp4-mono",
  display: "swap",
});

/**
 * Landing única com troca por breakpoint: abaixo de md roda a experiência mobile
 * (demo interativa no hero + linha do tempo de um dia de venda); a partir de md
 * roda a página densa de desktop (painel mock, esteira, método, tabela).
 * As duas árvores existem no HTML e o CSS escolhe uma — sem flash de hidratação.
 * Nav, régua de prova, FAQ, bloco de cancelamento e rodapé são compartilhados.
 */
export function Lp3Landing() {
  return (
    <div className={`lp4 ${archivo.variable} ${martian.variable} min-h-screen`}>
      <main className="w-full max-w-full overflow-x-clip">
        <div className="lp4-grain" aria-hidden />
        <Lp2Nav demoUrl={DEMO_URL} />

        {/* ==================== 1 · HERO ==================== */}
        <div className="md:hidden">
          <MobileHero />
        </div>
        <div className="hidden md:block">
          <DesktopHero />
        </div>

        {/* ==================== 2 · RÉGUA DE PROVA ==================== */}
        <ProofMarquee />

        {/* ==================== 3 · CORPO ==================== */}
        <div className="md:hidden">
          <MobileStory />
          <MobileTimeline />
        </div>
        <div className="hidden md:block">
          <DesktopBody />
        </div>

        {/* ============ 4 · PLANOS + CANCELAMENTO (antes do FAQ) ================ */}
        <div id="planos">
          <Plans />

          <div className="mx-auto max-w-6xl px-5 pb-12 md:pb-40">
            <div
              data-lp4-r
              className="flex flex-col items-center gap-6 rounded-3xl border border-[var(--line)] bg-[var(--bg-2)] p-9 text-center md:flex-row md:gap-12 md:p-12 md:text-left"
            >
              <p className="lp4-x text-[5rem] leading-none text-[var(--green)] md:text-[6.5rem]">0</p>
              <div>
                <h3 className="text-xl font-bold tracking-tight md:text-2xl">
                  multa pra cancelar
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--body)] md:text-base">
                  Cancele na própria tela de configurações, sem falar com ninguém. O acesso vale até
                  o fim do período que você já pagou — e os grupos e contatos continuam seus, de
                  qualquer jeito.
                </p>
                <p className="lp4-mono mt-4 text-[9px] text-[var(--body)]">
                  7 dias pra desistir e receber tudo de volta · sem fidelidade
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== 5 · FAQ ==================== */}
        <section id="faq" className="border-t border-[var(--line)] py-14 md:py-40">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div data-lp4-r>
              <h2 className="lp4-x text-[clamp(1.75rem,3.8vw,3rem)]">
                O que perguntam <span className="text-[var(--body)]">antes de começar.</span>
              </h2>
              <p className="mt-5 max-w-sm text-sm text-[var(--body)] md:text-base">
                Não achou a sua? Chama no WhatsApp — gente de verdade responde.
              </p>
              <a
                href={WHATSAPP_URL}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--green)] transition-colors hover:text-[var(--green-hover)]"
              >
                <WhatsAppIcon className="h-4 w-4" aria-hidden /> Perguntar agora
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <div data-lp4-r>
              {LP3_FAQ.map(([q, a]) => (
                <details key={q} className="lp4-faq py-5 md:py-6">
                  <summary className="flex items-center justify-between gap-4">
                    <span className="text-[15px] font-bold tracking-tight md:text-xl">{q}</span>
                    <span className="lp4-faq-x text-2xl font-light leading-none" aria-hidden>+</span>
                  </summary>
                  <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-[var(--body)] md:text-base">
                    {a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== 6 · FECHO ==================== */}
        <div className="md:hidden">
          <MobileFecho />
        </div>
        <div className="hidden md:block">
          <DesktopFecho />
        </div>

        {/* ==================== FOOTER ==================== */}
        <footer className="border-t border-[var(--line)] pb-28 pt-12 md:pb-12">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 text-center sm:flex-row sm:text-left">
            <div>
              <Logo className="text-lg" />
              <p className="lp4-mono mt-2 text-[8px] text-[var(--body)]">
                feito por atacadista, pra atacadista
              </p>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-[var(--body)]" aria-label="Links do rodapé">
              <a className="transition-colors hover:text-[var(--display)]" href="/login">Entrar</a>
              <a className="transition-colors hover:text-[var(--display)]" href="/termos">Termos</a>
              <a className="transition-colors hover:text-[var(--display)]" href="/privacidade">Privacidade</a>
            </nav>
            <p className="text-xs text-[var(--body)]">© {new Date().getFullYear()} Girumo</p>
          </div>
        </footer>

        {/* CTA fixo mobile — só aparece após o CTA do hero sair da tela */}
        <MobileCta demoUrl={DEMO_URL} whatsappUrl={WHATSAPP_URL} />

        <Lp2Fx />
        <FirstTouchCookie />
      </main>
    </div>
  );
}
