import { ChevronDown, Smartphone } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";
import { CommandTrigger } from "@/components/painel/command-palette";
import { NotificationBell } from "@/components/painel/notification-bell";

export function PainelTopbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line-200 bg-canvas-100 px-4 sm:px-6">
      {/* logo só no mobile (sidebar some) */}
      <div className="lg:hidden">
        <LogoSymbol className="h-7 w-7 text-volt-950" />
      </div>

      {/* seletor de instância (número conectado) */}
      <button className="hidden items-center gap-2 rounded-[10px] border border-volt-950/10 bg-papel px-3 py-2 text-sm text-volt-950 shadow-[var(--shadow-pn-1)] transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500/30 hover:shadow-[var(--shadow-pn-2)] sm:flex">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sucesso/10 text-sucesso">
          <Smartphone className="h-3 w-3" />
        </span>
        <span className="font-data font-medium tabular-nums">+55 11 9 8765-4321</span>
        <span className="h-1.5 w-1.5 rounded-full bg-sucesso pn-respira" title="Conectado" />
        <ChevronDown className="h-4 w-4 text-aco/50" />
      </button>

      {/* busca / ⌘K */}
      <CommandTrigger />

      <NotificationBell />
    </header>
  );
}
