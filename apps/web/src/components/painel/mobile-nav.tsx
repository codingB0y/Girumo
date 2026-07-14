"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sun,
  Layers,
  Users,
  UserPlus,
  TrendingUp,
  Menu,
  X,
  Settings,
  Sparkles,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

const PRIMARY = [
  { href: "/painel", label: "Início", icon: Sun },
  { href: "/painel/campanhas", label: "Campanhas", icon: Layers },
  { href: "/painel/squad-os", label: "Equipe AI", icon: Bot },
  { href: "/painel/resultados", label: "Resultados", icon: TrendingUp },
];

const ALL = [
  { href: "/painel", label: "Início", icon: Sun },
  { href: "/painel/campanhas", label: "Campanhas", icon: Layers },
  { href: "/painel/grupos", label: "Grupos", icon: Users },
  { href: "/painel/contatos", label: "Contatos", icon: UserPlus },
  { href: "/painel/resultados", label: "Resultados", icon: TrendingUp },
  { href: "/painel/squad-os", label: "Equipe AI", icon: Bot },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/painel" ? pathname === href : pathname.startsWith(href);
}

export function PainelMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra inferior */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-200 bg-canvas-100 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {PRIMARY.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors duration-[160ms]",
                active ? "text-iris" : "text-aco/55",
              )}
            >
              {/* indicador de ativo — pílula no topo */}
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full bg-iris transition-opacity duration-[240ms] ease-[var(--ease-fluxo)]",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-aco/55"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
          Mais
        </button>
      </nav>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-breu/60 backdrop-blur-sm"
          />
          <div className="pn-palette-in absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-volt-950">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo className="text-canvas-100" />
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-canvas-100/60 transition-colors duration-[var(--duration-micro)] hover:bg-paper-0/5 hover:text-canvas-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-2">
              {ALL.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-[color,background-color] duration-[160ms]",
                      active
                        ? "pn-ativo font-medium text-canvas-100"
                        : "text-canvas-100/55 hover:bg-paper-0/[0.03] hover:text-canvas-100",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px]", active ? "text-acid-500" : "text-canvas-100/45")} strokeWidth={1.75} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <div className="pn-aurora overflow-hidden rounded-2xl p-4">
                <p className="font-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-acid-500">
                  <Sparkles className="h-3 w-3" /> Plano Growth
                </p>
                <p className="mt-2 text-xs text-canvas-100/70">Grupos VIP ilimitados.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
