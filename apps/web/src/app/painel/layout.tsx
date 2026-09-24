import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Letreiro } from "@/components/painel/letreiro";
import { Corredor } from "@/components/painel/corredor";
import { BarraMobile } from "@/components/painel/barra-mobile";
import { PageTransition } from "@/components/painel/page-transition";
import { ToastProvider } from "@/components/toast";
import { RoleProvider } from "@/components/painel/role-provider";
import { SessionProvider } from "@/components/painel/session-provider";
import { CascaProvider } from "@/components/painel/casca-context";

export const metadata: Metadata = {
  title: "Painel — Girumo",
};

// Direção D: o painel fala Archivo, a família das landings. O .pn-root troca
// as três famílias do tema por esta variável (painel-vitrine.css).
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-painel", display: "swap" });

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  // Casca da direção D (spec 2026-09-24): corredor + letreiro no desktop,
  // letreiro + barra no mobile, tudo no tema noite.
  return (
    <RoleProvider>
      <SessionProvider>
        <ToastProvider>
          <CascaProvider>
            <div data-testid="painel-root" className={`${archivo.variable} pn-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950`}>
              <Corredor />
              <div className="flex min-w-0 flex-1 flex-col">
                <Letreiro />
                <main className="max-w-[var(--content-max)] flex-1 pb-20 lg:pb-0">
                  <PageTransition>{children}</PageTransition>
                </main>
              </div>
              <BarraMobile />
            </div>
          </CascaProvider>
        </ToastProvider>
      </SessionProvider>
    </RoleProvider>
  );
}
