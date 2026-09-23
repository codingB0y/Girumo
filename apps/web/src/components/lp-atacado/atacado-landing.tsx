import { League_Spartan } from "next/font/google";
import { MapPin } from "lucide-react";
import { FirstTouchCookie } from "@/components/analytics/first-touch-cookie";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Duvidas, Fecho, Planos } from "@/components/lp-atacado/atacado-closing";
import { AtacadoHero } from "@/components/lp-atacado/atacado-hero";
import { HorasNaMao, TresPassos } from "@/components/lp-atacado/atacado-how";
import { PostsQueVendem } from "@/components/lp-atacado/atacado-posts";
import { NumerosMegaStock, ProvaMegaStock } from "@/components/lp-atacado/atacado-proof";
import { CONTEUDO, FOCO, FOCO_ESCURO, LATERAIS, PILULA } from "@/components/lp-atacado/atacado-ui";
import { WHATSAPP_URL } from "@/components/lp3/landing-data";
import { OutboundTracker } from "@/components/lp3/outbound-tracker";
import { cn } from "@/lib/utils";

const spartan = League_Spartan({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-spartan",
  display: "swap",
});

/** Sem menu: só a marca, o público do anúncio e o atalho do WhatsApp de vendas. */
function Topo() {
  return (
    <header className={cn(LATERAIS, "border-b-2 border-volt-950")}>
      <div className={cn(CONTEUDO, "flex items-center justify-between gap-4 py-3 lg:py-4")}>
        <Logo className="text-[22px] lg:text-[28px]" />
        <p className="hidden items-center gap-2 text-[15px] font-bold lg:flex">
          <MapPin aria-hidden className="size-[18px] shrink-0" />
          Pra atacado de moda da 44, do Brás e do Bom Retiro
        </p>
        <a
          href={WHATSAPP_URL}
          data-outbound="whatsapp_click"
          className={cn(
            PILULA,
            "min-h-11 bg-acid-500 px-3.5 text-sm text-volt-950 hover:bg-[#C4FF74] lg:min-h-[46px] lg:px-[18px] lg:text-[15px]",
            FOCO,
          )}
        >
          <WhatsAppIcon className="size-[18px] shrink-0" />
          <span className="lg:hidden">WhatsApp</span>
          <span className="hidden lg:inline">Fala com a gente</span>
        </a>
      </div>
    </header>
  );
}

function Rodape() {
  const link = cn(
    // min-w-11: "Entrar" em 13 px tem ~38 px de largura; o alvo de toque é 44.
    "inline-flex min-h-11 min-w-11 items-center justify-center text-paper-0 underline underline-offset-4 hover:text-acid-500",
    FOCO_ESCURO,
  );
  return (
    <footer className={cn(LATERAIS, "bg-volt-950 pb-7 pt-5 text-[13px] text-[#C5CFCD] lg:py-6 lg:text-sm")}>
      <div className={cn(CONTEUDO, "flex flex-wrap items-center justify-between gap-x-6 gap-y-1")}>
        <Logo className="text-lg text-paper-0 lg:text-[22px]" />
        <nav aria-label="Rodapé" className="flex flex-wrap items-center gap-x-3.5 lg:gap-x-6">
          <a href="/login" className={link}>
            Entrar
          </a>
          <a href="/termos" className={link}>
            Termos
          </a>
          <a href="/privacidade" className={link}>
            Privacidade
          </a>
          <span>© {new Date().getFullYear()} Girumo</span>
        </nav>
      </div>
    </footer>
  );
}

/**
 * Landing do anúncio de atacado de moda (/44eBras, mockup Modelo 2): título em
 * League Spartan, corpo em Manrope (font-brand do root). Tudo é server
 * component; só a base comum (formulário, planos, calculadora) roda no cliente.
 */
export function AtacadoLanding() {
  return (
    <div className={`${spartan.variable} min-h-screen w-full overflow-x-clip bg-paper-0 font-brand text-volt-950`}>
      <Topo />
      <main>
        <AtacadoHero />
        <NumerosMegaStock />
        <PostsQueVendem />
        <TresPassos />
        <HorasNaMao />
        <ProvaMegaStock />
        <Planos />
        <Duvidas />
        <Fecho />
      </main>
      <Rodape />
      <FirstTouchCookie />
      <OutboundTracker />
    </div>
  );
}
