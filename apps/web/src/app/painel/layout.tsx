import type { Metadata } from "next";
import { PainelSidebar } from "@/components/painel/sidebar";
import { PainelTopbar } from "@/components/painel/topbar";
import { PainelMobileNav } from "@/components/painel/mobile-nav";
import { Letreiro } from "@/components/painel/letreiro";
import { Corredor } from "@/components/painel/corredor";
import { BarraMobile } from "@/components/painel/barra-mobile";
import { PageTransition } from "@/components/painel/page-transition";
import { ToastProvider } from "@/components/toast";
import { RoleProvider } from "@/components/painel/role-provider";
import { SessionProvider } from "@/components/painel/session-provider";
import { CascaProvider } from "@/components/painel/casca-context";
import { isPainelVitrineEnabled } from "@/lib/painel/flags";

export const metadata: Metadata = {
  title: "Painel — Girumo",
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  // Casca da Vitrine Aberta (PRs 2 e 3a): letreiro + corredor no desktop,
  // letreiro + barra no mobile. Desligada, a casca antiga inteira continua.
  const vitrine = isPainelVitrineEnabled();
  return (
    <RoleProvider>
      <SessionProvider>
        <ToastProvider>
          <CascaProvider>
            <div data-testid="painel-root" className="pn-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950">
              {vitrine ? <Corredor /> : <PainelSidebar />}
              <div className="flex min-w-0 flex-1 flex-col">
                {vitrine ? <Letreiro /> : <PainelTopbar />}
                <main className="flex-1 pb-20 lg:pb-0">
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
              {vitrine ? <BarraMobile /> : <PainelMobileNav />}
            </div>
          </CascaProvider>
        </ToastProvider>
      </SessionProvider>
    </RoleProvider>
  );
}
