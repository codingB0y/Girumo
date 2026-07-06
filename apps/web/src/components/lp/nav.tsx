"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  ["Método", "#metodo"],
  ["Case", "#case"],
  ["Planos", "#planos"],
  ["Dúvidas", "#faq"],
] as const;

/** Pílula flutuante: transparente no topo, vidro ao rolar. */
export function LpNav({ signupUrl }: { signupUrl: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <div
        className={cn(
          "lp3-nav mx-auto flex max-w-5xl items-center justify-between rounded-full px-5 py-3",
          scrolled && "is-scrolled",
        )}
      >
        <a href="#" aria-label="HubFlow — topo" className="flex items-baseline gap-1">
          <span className="text-lg font-extrabold tracking-tight">HubFlow</span>
          <span className="h-2 w-2 rounded-full bg-[var(--lp-accent)]" aria-hidden />
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Seções da página">
          {LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)]"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="/login"
            className="hidden text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)] sm:inline"
          >
            Entrar
          </a>
          <a href={signupUrl} className="lp3-btn lp3-btn-ink px-5 py-2.5 text-sm">
            Começar <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
