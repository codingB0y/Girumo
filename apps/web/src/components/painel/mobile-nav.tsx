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
import { Logo } from "@/components/landing/logo";

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
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-breu/10 bg-bruma/95 backdrop-blur-xl lg:hidden">
        {PRIMARY.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition",
                active ? "text-iris" : "text-aco/55",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-aco/55"
        >
          <Menu className="h-5 w-5" />
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
          <div className="hf-enter absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-breu">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo wordmarkClassName="text-white" symbolClassName="h-6 w-6" />
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-bruma/60 transition hover:bg-white/5 hover:text-white"
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
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                      active
                        ? "bg-white/[0.06] font-medium text-white"
                        : "text-bruma/55 hover:bg-white/[0.03] hover:text-bruma",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px]", active ? "text-iris-claro" : "")} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-5">
              <div className="rounded-2xl border border-iris/20 bg-iris/[0.07] p-4">
                <p className="font-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-iris-claro">
                  <Sparkles className="h-3 w-3" /> Plano Growth
                </p>
                <p className="mt-2 text-xs text-bruma/60">Grupos VIP ilimitados.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
