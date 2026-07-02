"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/landing/logo";

const LINKS = [
  ["Mecanismo", "#mecanismo"],
  ["Painel", "#painel"],
  ["Planos", "#planos"],
  ["Dúvidas", "#duvidas"],
] as const;

/** Nav v2: barra transparente que vira pílula de vidro flutuante ao rolar. */
export function Nav({ signupUrl }: { signupUrl: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // trava o scroll com o menu mobile aberto
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 px-4", scrolled && "lp-nav-scrolled")}>
      <div className="lp-nav-inner mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-transparent px-4 py-3">
        <Link href="/" aria-label="HubFlow — início" className="shrink-0">
          <Logo wordmarkClassName="text-white" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegação principal">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="lp-link font-data text-xs uppercase tracking-[0.18em] text-bruma/60 transition hover:text-white">
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm text-bruma/60 transition hover:text-white sm:inline">
            Entrar
          </Link>
          <a
            href={signupUrl}
            className="lp-btn lp-btn-primary hidden items-center gap-2 rounded-xl bg-iris px-4 py-2 text-sm font-medium text-white md:inline-flex"
          >
            Começar grátis <ArrowRight className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* menu mobile — overlay cheio */}
      {open && (
        <div className="fixed inset-0 top-[68px] z-40 bg-void/95 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-1 px-6 pt-8" aria-label="Menu">
            {LINKS.map(([label, href], i) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="dz-rise border-b border-white/10 py-5 font-editorial text-3xl text-white"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {label}
              </a>
            ))}
            <div className="mt-8 flex flex-col gap-3">
              <a
                href={signupUrl}
                className="lp-btn lp-btn-primary flex items-center justify-center gap-2 rounded-xl bg-iris py-3.5 font-medium text-white"
              >
                Começar grátis <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-xl border border-white/15 py-3.5 text-white"
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
