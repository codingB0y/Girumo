"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Sun,
  Rocket,
  Users,
  Layers,
  Target,
  Gift,
  Link2,
  UserPlus,
  Send,
  FileText,
  CalendarClock,
  BarChart3,
  Settings,
  MessageCircle,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, setActiveTenantId } from "@/lib/supabase/client";

export const nav = [
  { href: "/hoje", label: "Hoje", icon: Sun },
  { href: "/crescer", label: "Crescer", icon: Rocket },
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/campanhas", label: "Campanhas", icon: Layers },
  { href: "/groups", label: "Meus grupos", icon: Users },
  { href: "/acquisition", label: "Atrair revendedoras", icon: Target },
  { href: "/indicacao", label: "Indicação premiada", icon: Gift },
  { href: "/links", label: "Origem das entradas", icon: Link2 },
  { href: "/leads", label: "Revendedoras", icon: UserPlus },
  { href: "/campaigns", label: "Ofertas", icon: Send },
  { href: "/templates", label: "Modelos de mensagem", icon: FileText },
  { href: "/schedules", label: "Divulgações agendadas", icon: CalendarClock },
  { href: "/reports", label: "Resultados", icon: BarChart3 },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut().catch(() => {});
    setActiveTenantId(null);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur-xl md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="font-semibold tracking-tight text-slate-900">HUBFLOW</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-500">WhatsApp Growth OS</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />
              )}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600",
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200/70 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sair
        </button>
      </div>
    </aside>
  );
}
