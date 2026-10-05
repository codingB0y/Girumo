import type { Metadata } from "next";
import { Letreiro } from "@/components/painel/letreiro";
import { Corredor } from "@/components/painel/corredor";
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
  // Casca da direção D (spec 2026-09-24): corredor + letreiro no desktop,
  // letreiro + barra no mobile. Tema claro G2 e fontes da raiz (spec 2026-10-05).
  return (
    <RoleProvider>
      <SessionProvider>
        <ToastProvider>
          <CascaProvider>
            <div data-testid="painel-root" className="pn-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950">
              <Corredor />
              <div className="flex min-w-0 flex-1 flex-col">
                <Letreiro />
                {/* Uma leitura do teste para a faixa e para todo paywall aberto nas telas. */}
                <TrialProvider>
                  <TrialBanner />
                  <MioloDoPainel>{children}</MioloDoPainel>
                </TrialProvider>
              </div>
              <BarraMobile />
            </div>
          </CascaProvider>
        </ToastProvider>
      </SessionProvider>
    </RoleProvider>
  );
}
