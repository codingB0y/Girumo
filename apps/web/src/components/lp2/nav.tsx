"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LINKS = [
  ["Método", "#metodo"],
  ["Sistema", "#prova"],
  ["Planos", "#planos"],
  ["Dúvidas", "#faq"],
] as const;

/** Navegação compacta do experimento sobre uma superfície Volt opaca. */
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
          "lp4-nav mx-auto flex max-w-5xl items-center justify-between rounded-[var(--radius-card)] px-5 py-3",
          scrolled && "is-scrolled",
        )}
      >
        <a href="#" aria-label={`${BRAND.name} — topo`}>
          <Logo className="text-lg text-paper-0" />
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Seções da página">
          {LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-canvas-100/70 transition-colors hover:text-paper-0"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <a
            href="/login"
            className="hidden text-sm text-canvas-100/70 transition-colors hover:text-paper-0 sm:inline"
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
