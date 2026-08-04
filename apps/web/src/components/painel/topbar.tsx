"use client";

import Link from "next/link";
import { Smartphone, WifiOff } from "lucide-react";
import { LogoSymbol } from "@/components/brand/logo";
import { CommandTrigger } from "@/components/painel/command-palette";
import { NotificationBell } from "@/components/painel/notification-bell";
import { usePanelSession } from "@/components/painel/session-provider";
import { formatPhoneBR } from "@/lib/phone";
import { cn } from "@/lib/utils";

export function PainelTopbar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line-200 bg-canvas-100 px-4 sm:px-6">
      {/* logo só no mobile (sidebar some) */}
      <div className="lg:hidden">
        <LogoSymbol className="h-7 w-7 text-volt-950" />
      </div>

      <ConnectedNumber />

      {/* busca / ⌘K */}
      <CommandTrigger />

      <NotificationBell />
    </header>
  );
}

/**
 * Número de WhatsApp realmente conectado. Enquanto não sabemos (carregando) ou
 * não deu pra saber (API fora), não afirmamos nada — antes esta área mostrava
 * um número fixo de exemplo com bolinha verde permanente, o que dizia ao
 * lojista desconectado que estava tudo certo.
 */
function ConnectedNumber() {
  const { session, loading } = usePanelSession();

  if (loading) {
    return <div className="pn-skeleton hidden h-9 w-44 rounded-[10px] sm:block" />;
  }

  // Sem resposta da API: some em vez de inventar um estado.
  if (!session) return null;

  const phone = formatPhoneBR(session.phone);
  const label = session.live ? (phone ?? session.profileName ?? "WhatsApp conectado") : "WhatsApp desconectado";

  return (
    <Link
      href="/painel/conectar"
      title={session.live ? (session.profileName ?? undefined) : "Reconectar WhatsApp"}
      className={cn(
        "hidden items-center gap-2 rounded-[10px] border bg-papel px-3 py-2 text-sm shadow-[var(--shadow-pn-1)] transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] hover:shadow-[var(--shadow-pn-2)] sm:flex",
        session.live
          ? "border-volt-950/10 text-volt-950 hover:border-cobalt-500/30"
          : "border-alerta/30 text-alerta hover:border-alerta/50",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md",
          session.live ? "bg-sucesso/10 text-sucesso" : "bg-alerta/10 text-alerta",
        )}
      >
        {session.live ? <Smartphone className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      </span>
      <span className={cn("font-medium", session.live && phone && "font-data tabular-nums")}>{label}</span>
      {session.live && <span className="h-1.5 w-1.5 rounded-full bg-sucesso pn-respira" aria-hidden="true" />}
    </Link>
  );
}
