import { Archivo } from "next/font/google";
import { FirstTouchCookie } from "@/components/analytics/first-touch-cookie";
import { Logo } from "@/components/brand/logo";
import { OutboundTracker } from "@/components/lp3/outbound-tracker";
import { LATERAL, TITULO, ViewportText } from "@/components/lp-cartaz/cartaz-ui";
import { CartazHeader, CartazHero, CartazNumbers } from "@/components/lp-cartaz/hero";
import { CartazAudience, CartazHowItWorks } from "@/components/lp-cartaz/how-it-works";
import { CartazFaq, CartazPlans } from "@/components/lp-cartaz/plans";
import { CartazPosts } from "@/components/lp-cartaz/posts";
import { CartazProof, CartazSafety } from "@/components/lp-cartaz/proof";
import { PERGUNTA_GRUPOS, PERGUNTA_LOJA } from "@/components/lp-shared/lead-message";
import { LeadWizard } from "@/components/lp-shared/lead-wizard";
import { cn } from "@/lib/utils";

/** Archivo com o eixo de largura: os títulos são o condensado a 68% (cartaz de loja). */
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-cartaz", display: "swap" });

/**
 * Cartaz+ — a home (`/`). Mockups aprovados em 23/09/2026: cp-desktop (1440) e
 * cp-mobile (390), numa árvore só: a base é o celular e o `lg:` é o desktop.
 * Server component; o que tem estado (formulário e planos) vem de lp-shared.
 */
export function CartazLanding() {
  return (
    <div
      className={`${archivo.variable} flex min-h-screen w-full flex-col overflow-x-clip bg-paper-0 font-[family-name:var(--font-cartaz)] text-volt-950`}
    >
      <CartazHeader />
      <main>
        <CartazHero />
        <CartazNumbers />
        <CartazAudience />
        <CartazHowItWorks />
        <CartazProof />
        <CartazSafety />
        <CartazPosts />
        <CartazPlans />
        <CartazFaq />
        <ClosingCall />
      </main>
      <Footer />
      <FirstTouchCookie />
      <OutboundTracker />
    </div>
  );
}

/**
 * Fecho acid com o formulário de novo (outra instância: recomeça no passo 1).
 * Desktop: texto à esquerda e formulário à direita; celular: título, formulário
 * e o PS embaixo — o grid posiciona cada peça no desktop.
 */
function ClosingCall() {
  return (
    <section
      aria-labelledby="cartaz-fecho"
      className={cn(
        "flex flex-col gap-4 border-t-[1.5px] border-volt-950 bg-acid-500 py-11",
        "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,.92fr)] lg:gap-x-16 lg:gap-y-[22px] lg:py-[88px]",
        LATERAL,
      )}
    >
      <h2 id="cartaz-fecho" className={cn(TITULO, "text-[50px] lg:col-start-1 lg:row-start-1 lg:text-[96px]")}>
        Seu próximo grupo cheio começa com um link.
      </h2>
      <p className="hidden text-[19px] font-semibold leading-[1.55] lg:col-start-1 lg:row-start-2 lg:block lg:max-w-[560px]">
        Quem atende é gente de Goiânia, que já fez isso no próprio estoque.
      </p>
      <LeadWizard
        variant="cartaz"
        steps={[PERGUNTA_LOJA, PERGUNTA_GRUPOS]}
        className="lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center"
      />
      <p className="text-[15px] font-semibold leading-normal lg:col-start-1 lg:row-start-3 lg:max-w-[560px] lg:text-[17px] lg:font-normal lg:leading-[1.55]">
        <b>PS:</b>{" "}
        <ViewportText
          mobile="7 dias pra desistir. Os grupos continuam seus."
          desktop="são 7 dias pra desistir. Se não gostar, devolvemos tudo, e os grupos continuam seus."
        />
      </p>
    </section>
  );
}

/** Alvo de 44×44 no mínimo ("Entrar" sozinho teria 38 px de largura). */
const LINK_RODAPE =
  "inline-flex min-h-11 min-w-11 items-center justify-center underline underline-offset-2 hover:text-acid-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500";

function Footer() {
  return (
    <footer
      className={cn(
        "flex flex-col gap-3 bg-volt-950 pb-[34px] pt-[26px] text-sm text-paper-0",
        "lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:py-[30px] lg:text-[15px]",
        LATERAL,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-[22px]">
        <Logo className="text-[20px] lg:text-2xl" />
        <p className="text-line-200">Feito por atacadista, pra atacadista.</p>
      </div>
      <nav aria-label="Rodapé" className="flex flex-wrap items-center gap-x-4 lg:-my-2.5 lg:gap-x-[26px]">
        <a href="/login" className={LINK_RODAPE}>
          Entrar
        </a>
        <a href="/termos" className={LINK_RODAPE}>
          Termos
        </a>
        <a href="/privacidade" className={LINK_RODAPE}>
          Privacidade
        </a>
        <span className="text-line-200">© {new Date().getFullYear()} Girumo</span>
      </nav>
    </footer>
  );
}
