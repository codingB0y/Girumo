"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";

const LINKS = [
  ["Mecanismo", "#mecanismo"],
  ["Recursos", "#recursos"],
  ["Planos", "#planos"],
  ["Dúvidas", "#duvidas"],
] as const;

export function Nav({ signupUrl }: { signupUrl: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    if (open) window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-volt-800 bg-volt-950">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <Link href="/" aria-label={`${BRAND.name} - início`} className="shrink-0">
          <Logo className="text-paper-0" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Navegação principal">
          {LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="lp-link whitespace-nowrap font-data text-xs uppercase tracking-[0.14em] text-canvas-100/65 transition hover:text-paper-0"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden whitespace-nowrap text-sm text-canvas-100/65 transition hover:text-paper-0 sm:inline">
            Entrar
          </Link>
          <a
            href={signupUrl}
            className="lp-btn hidden items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] bg-acid-500 px-4 py-2 text-sm font-semibold text-volt-950 hover:brightness-95 md:inline-flex"
          >
            Começar agora <ArrowRight className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-paper-0/25 text-paper-0 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-navigation" className="fixed inset-0 top-16 z-40 overflow-y-auto bg-volt-950 md:hidden">
          <nav className="flex min-h-full flex-col gap-1 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8" aria-label="Menu">
            {LINKS.map(([label, href], index) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="dz-rise border-b border-volt-800 py-5 font-tech text-3xl font-bold tracking-tight text-paper-0 motion-reduce:animate-none"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {label}
              </a>
            ))}
            <div className="mt-8 flex flex-col gap-3">
              <a
                href={signupUrl}
                className="lp-btn flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-acid-500 py-3.5 font-semibold text-volt-950"
              >
                Começar agora <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-[var(--radius-control)] border border-paper-0/25 py-3.5 text-paper-0"
              >
                Entrar
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
