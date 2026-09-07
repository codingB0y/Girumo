import type { Metadata } from "next";
import { PainelSidebar } from "@/components/painel/sidebar";
import { PainelTopbar } from "@/components/painel/topbar";
import { PainelMobileNav } from "@/components/painel/mobile-nav";
import { LetreiroMobile } from "@/components/painel/letreiro-mobile";
import { BarraMobile } from "@/components/painel/barra-mobile";
import { PageTransition } from "@/components/painel/page-transition";
import { ToastProvider } from "@/components/toast";
import { RoleProvider } from "@/components/painel/role-provider";
import { SessionProvider } from "@/components/painel/session-provider";
import { isPainelVitrineEnabled } from "@/lib/painel/flags";

export const metadata: Metadata = {
  title: "Painel — Girumo",
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  // Casca mobile da Vitrine Aberta (PR 2). Desligada, nada muda; o desktop
  // continua na casca antiga até o corredor e o letreiro de 64px entrarem.
  const vitrine = isPainelVitrineEnabled();
  return (
    <RoleProvider>
      <SessionProvider>
        <ToastProvider>
          <div data-testid="painel-root" className="pn-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950">
            <PainelSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              {vitrine && <LetreiroMobile />}
              <PainelTopbar somenteDesktop={vitrine} />
              <main className="flex-1 pb-20 lg:pb-0">
                <PageTransition>{children}</PageTransition>
              </main>
            </div>
            {vitrine ? <BarraMobile /> : <PainelMobileNav />}
          </div>
        </ToastProvider>
      </SessionProvider>
    </RoleProvider>
  );
}
