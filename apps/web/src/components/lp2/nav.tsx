"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  ["Método", "#metodo"],
  ["Prova", "#prova"],
  ["Planos", "#planos"],
  ["Dúvidas", "#faq"],
] as const;

/** Pílula flutuante — transparente no topo, vidro carvão ao rolar. */
export function Lp2Nav({ signupUrl }: { signupUrl: string }) {
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
          "lp4-nav mx-auto flex max-w-5xl items-center justify-between rounded-full px-5 py-3",
          scrolled && "is-scrolled",
        )}
      >
        <a href="#" aria-label="HubFlow — topo" className="lp4-x text-base tracking-tight">
          HubFlow
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Seções da página">
          {LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-[var(--body)] transition-colors hover:text-[var(--display)]"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="/login"
            className="hidden text-sm text-[var(--body)] transition-colors hover:text-[var(--display)] sm:inline"
          >
            Entrar
          </a>
          <a href={signupUrl} className="lp4-btn lp4-btn-green px-5 py-2.5 text-sm">
            Começar <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
