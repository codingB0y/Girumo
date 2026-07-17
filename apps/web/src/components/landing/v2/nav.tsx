"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeAtDesktop = () => {
      if (desktop.matches) setOpen(false);
    };

    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const header = headerRef.current;
    const siblings = Array.from(header?.parentElement?.children ?? []).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== header,
    );
    const siblingStates = siblings.map((node) => ({
      node,
      hadInert: node.hasAttribute("inert"),
      previousAriaHidden: node.getAttribute("aria-hidden"),
    }));
    siblingStates.forEach(({ node }) => {
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });

    const focusableItems = () =>
      Array.from(
        headerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.getClientRects().length > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest("[inert]")
        );
      });

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = menuRef.current?.querySelector<HTMLElement>('a[href]');
      (initialFocus ?? header)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusableItems();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !headerRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !headerRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown, true);
      siblingStates.forEach(({ node, hadInert, previousAriaHidden }) => {
        if (!hadInert) node.removeAttribute("inert");
        if (previousAriaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", previousAriaHidden);
      });
    };
  }, [closeMenu, open]);

  return (
    <header
      ref={headerRef}
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? "Menu de navegação" : undefined}
      tabIndex={open ? -1 : undefined}
      className="fixed inset-x-0 top-0 z-50 border-b border-volt-800 bg-volt-950"
    >
      <div className="mx-auto flex h-16 max-w-[var(--content-max)] items-center justify-between px-4 md:px-8">
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
          <Link href="/login" className="hidden whitespace-nowrap text-sm text-canvas-100/65 transition hover:text-paper-0 md:inline">
            Entrar
          </Link>
          <a
            href={signupUrl}
            className="lp-btn hidden items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] bg-acid-500 px-4 py-2 text-sm font-semibold text-volt-950 hover:brightness-95 md:inline-flex"
          >
            Começar agora <ArrowRight className="h-4 w-4" />
          </a>
          <button
            ref={triggerRef}
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
        <div
          ref={menuRef}
          id="mobile-navigation"
          className="fixed inset-0 top-16 z-40 overflow-y-auto bg-volt-950 md:hidden"
        >
          <nav className="flex min-h-full flex-col gap-1 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8" aria-label="Menu">
            {LINKS.map(([label, href], index) => (
              <a
                key={href}
                href={href}
                onClick={closeMenu}
                className="dz-rise border-b border-volt-800 py-5 font-tech text-3xl font-bold tracking-tight text-paper-0 motion-reduce:animate-none"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {label}
              </a>
            ))}
            <div className="mt-8 flex flex-col gap-3">
              <a
                href={signupUrl}
                onClick={closeMenu}
                className="lp-btn flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-acid-500 py-3.5 font-semibold text-volt-950"
              >
                Começar agora <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/login"
                onClick={closeMenu}
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
