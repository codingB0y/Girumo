"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  FileText,
  Gift,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageCircle,
  Rocket,
  Send,
  Settings,
  Sun,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, setActiveTenantId } from "@/lib/supabase/client";

export const navSections = [
  {
    label: "Operacao",
    items: [
      { href: "/hoje", label: "Hoje", icon: Sun },
      { href: "/dashboard", label: "Visao geral", icon: LayoutDashboard },
      { href: "/reports", label: "Resultados", icon: BarChart3 },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { href: "/crescer", label: "Crescer", icon: Rocket },
      { href: "/acquisition", label: "Atrair leads", icon: Target },
      { href: "/links", label: "Origem das entradas", icon: Link2 },
      { href: "/indicacao", label: "Indicacao", icon: Gift },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { href: "/groups", label: "Grupos", icon: Users },
      { href: "/leads", label: "Contatos", icon: UserPlus },
    ],
  },
  {
    label: "Campanhas",
    items: [
      { href: "/campanhas", label: "Campanhas", icon: Layers },
      { href: "/campaigns", label: "Ofertas", icon: Send },
      { href: "/templates", label: "Modelos", icon: FileText },
      { href: "/schedules", label: "Agendamentos", icon: CalendarClock },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/settings", label: "Configuracoes", icon: Settings }],
  },
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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-brand">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="font-semibold tracking-tight text-slate-900">HUBFLOW</p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">WhatsApp Growth OS</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sair
        </button>
      </div>
    </aside>
  );
}
