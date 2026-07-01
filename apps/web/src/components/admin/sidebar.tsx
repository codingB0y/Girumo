"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  Smartphone,
  CreditCard,
  Activity,
  Settings,
  Shield,
  HeartPulse,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";

const SECTIONS = [
  {
    label: "Plataforma",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/tenants", label: "Tenants", icon: Building2 },
      { href: "/admin/usuarios", label: "Usuários", icon: Users },
      { href: "/admin/instancias", label: "Instâncias", icon: Smartphone },
      { href: "/admin/agentes", label: "Agentes IA", icon: Bot },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/admin/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/logs", label: "Logs & Eventos", icon: Activity },
      { href: "/admin/saude", label: "Saúde", icon: HeartPulse },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-breu lg:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <Logo wordmarkClassName="text-white" symbolClassName="h-6 w-6" />
        <span className="rounded-md bg-alerta/20 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-alerta">
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="font-data px-3 pb-2 text-[10px] uppercase tracking-[0.2em] text-bruma/30">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map(({ href, label, icon: Icon }) => {
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
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-alerta" />
                    )}
                    <Icon className={cn("h-[18px] w-[18px]", active ? "text-alerta" : "")} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-alerta/20 text-alerta">
            <Shield className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-bruma/90">Super Admin</p>
            <p className="truncate font-data text-[10px] text-bruma/40">{email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
