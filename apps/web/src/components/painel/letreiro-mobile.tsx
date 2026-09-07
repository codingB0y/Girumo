"use client";

import Link from "next/link";
import { LogoSymbol } from "@/components/brand/logo";
import { NotificationBell } from "@/components/painel/notification-bell";
import { useRole } from "@/components/painel/role-provider";
import { usePanelSession } from "@/components/painel/session-provider";
import { cn } from "@/lib/utils";

/**
 * Letreiro mobile (spec 3.2): 56px em Volt, símbolo 22px + nome da loja +
 * ponto do número (respira conectado, parado desconectado) + sino. O ticker
 * vira a primeira linha do conteúdo (PR 3).
 */
export function LetreiroMobile() {
  const { tenantName } = useRole();
  const { session } = usePanelSession();

  return (
    <header data-testid="painel-letreiro" className="pn-letreiro pn-letreiro--mobile sticky top-0 z-20 lg:hidden">
      <Link href="/painel" className="flex min-w-0 items-center gap-2">
        <LogoSymbol className="h-[22px] w-[22px] shrink-0" title="Girumo" />
        <span className="pn-letreiro__loja pn-letreiro__loja--mobile truncate">{tenantName ?? "Sua loja"}</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {session && (
          <Link
            href="/painel/conectar"
            aria-label={session.live ? "WhatsApp conectado" : "WhatsApp desconectado. Reconectar"}
            className="flex h-11 w-11 items-center justify-center"
          >
            <span
              className={cn("pn-ponto", session.live ? "pn-ponto--conectado pn-respira" : "pn-ponto--desconectado")}
              aria-hidden="true"
            />
          </Link>
        )}
        <NotificationBell tom="escuro" />
      </div>
    </header>
  );
}
