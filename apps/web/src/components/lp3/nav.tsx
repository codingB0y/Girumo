"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const LINKS = [
  ["Método", "#metodo"],
  ["Prova", "#prova"],
  ["Planos", "#planos"],
  ["Dúvidas", "#faq"],
] as const;

/** Pílula flutuante — transparente no topo, vidro carvão ao rolar.
 *  No mobile some ao rolar pra baixo (a barra fixa de CTA assume) e
 *  volta ao rolar pra cima. */
export function Lp2Nav({ signupUrl }: { signupUrl: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setHidden(y > 140 && y > lastY.current);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-4 z-50 px-4 transition-transform duration-500 ease-out",
        hidden && "max-md:-translate-y-[140%]",
      )}
    >
      <div
        className={cn(
          "lp4-nav mx-auto flex max-w-5xl items-center justify-between rounded-full px-5 py-3",
          scrolled && "is-scrolled",
        )}
      >
        <a href="#" aria-label="Girumo — topo" className="inline-flex items-center">
          <Logo className="text-[17px]" title={null} />
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
            className="text-sm text-[var(--body)] transition-colors hover:text-[var(--display)]"
          >
            Entrar
          </a>
          {/* CTA da nav só no desktop — no mobile a barra fixa embaixo assume.
              Wrapper controla a visibilidade (o display do .lp4-btn venceria o .hidden). */}
          <div className="hidden md:block">
            <a href={signupUrl} className="lp4-btn lp4-btn-green px-5 py-2.5 text-sm">
              Começar <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
