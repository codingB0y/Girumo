"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navSections } from "./sidebar";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Barra superior só no mobile */}
      <div className="flex h-14 items-center gap-3 border-b border-breu/10 bg-breu px-4 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-lg p-1.5 text-bruma/70 hover:bg-white/5 hover:text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo wordmarkClassName="text-white" symbolClassName="h-6 w-6" />
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-breu/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="hf-enter absolute left-0 top-0 flex h-full w-72 flex-col bg-breu shadow-xl">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo wordmarkClassName="text-white" symbolClassName="h-6 w-6" />
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-1.5 text-bruma/60 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-5 overflow-y-auto p-3">
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
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
