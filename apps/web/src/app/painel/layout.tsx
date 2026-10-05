import type { Metadata } from "next";
import { BarraDeCima } from "@/components/painel/barra-de-cima";
import { BarraMobile } from "@/components/painel/barra-mobile";
import { MioloDoPainel } from "@/components/painel/miolo";
import { ToastProvider } from "@/components/toast";
import { RoleProvider } from "@/components/painel/role-provider";
import { SessionProvider } from "@/components/painel/session-provider";
import { CascaProvider } from "@/components/painel/casca-context";
import { TrialBanner } from "@/components/painel/trial/trial-banner";
import { TrialProvider } from "@/components/painel/trial/use-trial";

export const metadata: Metadata = {
  title: "Painel — Girumo",
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  // Casca G2 (spec 2026-10-05): barra volt em cima em toda largura; barra inferior no celular.
  return (
    <RoleProvider>
      <SessionProvider>
        <ToastProvider>
          <CascaProvider>
            <div data-testid="painel-root" className="pn-root font-body flex min-h-screen w-full flex-col bg-canvas-100 text-volt-950">
              <BarraDeCima />
              {/* Uma leitura do teste para a faixa e para todo paywall aberto nas telas. */}
              <TrialProvider>
                <TrialBanner />
                <MioloDoPainel>{children}</MioloDoPainel>
              </TrialProvider>
              <BarraMobile />
            </div>
          </CascaProvider>
        </ToastProvider>
      </SessionProvider>
    </RoleProvider>
  );
}
