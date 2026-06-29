"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Layers, LogOut, Settings, Sun, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient, setActiveTenantId } from "@/lib/supabase/client";
import { Logo } from "@/components/landing/logo";

export const navSections = [
  {
    label: "Principal",
    items: [
      { href: "/hoje", label: "Hoje", icon: Sun },
      { href: "/campanhas", label: "Campanhas", icon: Layers },
      { href: "/groups", label: "Grupos", icon: Users },
      { href: "/leads", label: "Contatos", icon: UserPlus },
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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-breu md:flex">
      <div className="flex h-16 items-center px-5">
        <Logo wordmarkClassName="text-white" symbolClassName="h-6 w-6" />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="font-data px-3 pb-2 text-[10px] uppercase tracking-[0.2em] text-bruma/30">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
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
                    <Icon
                      className={cn("h-[18px] w-[18px] transition-colors", active ? "text-iris-claro" : "")}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-bruma/50 transition hover:bg-white/[0.03] hover:text-bruma"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sair
        </button>
      </div>
    </aside>
  );
}
