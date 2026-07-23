import type { Metadata } from "next";
import { PainelSidebar } from "@/components/painel/sidebar";
import { PainelTopbar } from "@/components/painel/topbar";
import { PainelMobileNav } from "@/components/painel/mobile-nav";
import { PageTransition } from "@/components/painel/page-transition";
import { CommandPalette } from "@/components/painel/command-palette";
import { ToastProvider } from "@/components/toast";
import { RoleProvider } from "@/components/painel/role-provider";
import { RealtimeToasts } from "@/components/painel/realtime-toasts";

export const metadata: Metadata = {
  title: "Painel — Girumo",
};

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <ToastProvider>
        <div className="pn-root font-body flex min-h-screen w-full bg-canvas-100 text-volt-950">
          <PainelSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <PainelTopbar />
            <main className="flex-1 pb-20 lg:pb-0">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
          <PainelMobileNav />
          <CommandPalette />
          <RealtimeToasts />
        </div>
      </ToastProvider>
    </RoleProvider>
  );
}
