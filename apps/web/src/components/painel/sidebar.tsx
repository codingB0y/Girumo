"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sun,
  Layers,
  Users,
  UserPlus,
  TrendingUp,
  Settings,
  Sparkles,
  PanelsTopLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";

const NAV_ITEMS = [
  { href: "/painel", label: "Início", icon: Sun },
  { href: "/painel/campanhas", label: "Campanhas", icon: Layers },
  { href: "/painel/grupos", label: "Grupos", icon: Users },
  { href: "/painel/contatos", label: "Contatos", icon: UserPlus },
  { href: "/painel/pages", label: "Páginas", icon: PanelsTopLeft },
  { href: "/painel/resultados", label: "Resultados", icon: TrendingUp },
];

const BOTTOM_ITEMS = [
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/painel" ? pathname === href : pathname.startsWith(href);
}

export function PainelSidebar() {
  const pathname = usePathname();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setConnected(s?.live === true))
      .catch(() => setConnected(false));
  }, []);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-breu lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo wordmarkClassName="text-white" symbolClassName="h-6 w-6" />
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-white/[0.06] font-medium text-white"
                    : "text-bruma/55 hover:bg-white/[0.03] hover:text-bruma",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-iris" />
                )}
                <Icon className={cn("h-[18px] w-[18px]", active ? "text-iris-claro" : "")} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/5 px-3 py-4">
        {/* Connection status */}
        <Link
          href="/painel/conectar"
          className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-white/[0.03]"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected === null ? "bg-bruma/40" : connected ? "bg-sucesso" : "bg-alerta",
            )}
          />
          <span className={cn("text-xs", connected ? "text-bruma/60" : "text-atencao")}>
            {connected === null ? "Verificando…" : connected ? "WhatsApp conectado" : "WhatsApp desconectado"}
          </span>
        </Link>

        <div className="space-y-1">
          {BOTTOM_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-white/[0.06] font-medium text-white"
                    : "text-bruma/55 hover:bg-white/[0.03] hover:text-bruma",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-iris" />
                )}
                <Icon className={cn("h-[18px] w-[18px]", active ? "text-iris-claro" : "")} />
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-3 pb-4">
        <div className="rounded-2xl border border-iris/20 bg-iris/[0.07] p-4">
          <p className="font-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-iris-claro">
            <Sparkles className="h-3 w-3" /> Plano Growth
          </p>
          <p className="mt-2 text-xs text-bruma/60">Grupos VIP ilimitados · suporte no WhatsApp.</p>
          <Link
            href="/painel/configuracoes"
            className="mt-3 flex w-full items-center justify-center rounded-lg bg-white/5 py-2 text-xs font-medium text-white transition hover:bg-white/10"
          >
            Gerenciar plano
          </Link>
        </div>
      </div>
    </aside>
  );
}
