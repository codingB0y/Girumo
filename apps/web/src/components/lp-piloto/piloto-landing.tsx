import { FirstTouchCookie } from "@/components/analytics/first-touch-cookie";
import { OutboundTracker } from "@/components/lp3/outbound-tracker";
import { PilotoDuvidas, PilotoFecho, PilotoRodape } from "@/components/lp-piloto/closing";
import { PilotoConta, PilotoSeguranca } from "@/components/lp-piloto/cost-safety";
import { PilotoRecursos } from "@/components/lp-piloto/features";
import { PilotoFluxo } from "@/components/lp-piloto/flow";
import { PilotoHeader, PilotoHero } from "@/components/lp-piloto/hero";
import { PilotoPlanos, PilotoProva } from "@/components/lp-piloto/proof-plans";

/**
 * /automatico — Modelo 1, "Piloto automático": linguagem de automação, sem
 * nichar em moda. Uma árvore só: base = celular (390), `lg:` = desktop (1440).
 * Mockups: m1-desktop.html e m1-mobile.html.
 */
export function PilotoLanding() {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-paper-0 font-brand text-volt-950">
      <PilotoHeader />
      <main>
        <PilotoHero />
        <PilotoFluxo />
        <PilotoRecursos />
        <PilotoConta />
        <PilotoSeguranca />
        <PilotoProva />
        <PilotoPlanos />
        <PilotoDuvidas />
        <PilotoFecho />
      </main>
      <PilotoRodape />
      <FirstTouchCookie />
      <OutboundTracker />
    </div>
  );
}
