"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Orquestrador GSAP da /lp2 — data-attributes:
 *  [data-lp4-hi]   entrada do hero (stagger)
 *  [data-lp4-r]    fade-up ao entrar na viewport
 *  [data-lp4-w]    janelas de produto assentam (scale/settle)
 *  [data-lp4-c]    contadores (data-to, data-sep)
 *  [data-lp4-path] linha da esteira desenhada por scrub (SVG path)
 *
 * Sem JS / prefers-reduced-motion: conteúdo 100% visível
 * (estados iniciais só via gsap.from, nunca no CSS).
 */
export function Lp2Fx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from("[data-lp4-hi]", {
        y: 24,
        opacity: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.08,
        delay: 0.1,
      });

      gsap.utils.toArray<HTMLElement>("[data-lp4-r]").forEach((el) => {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 1,
          ease: "power4.out",
          scrollTrigger: { trigger: el, start: "top 86%" },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-lp4-w]").forEach((el) => {
        gsap.from(el, {
          scale: 0.96,
          y: 24,
          opacity: 0.35,
          duration: 1.1,
          ease: "power4.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-lp4-c]").forEach((el) => {
        const to = Number(el.dataset.to ?? "0");
        const useSep = el.dataset.sep !== undefined;
        const state = { v: 0 };
        gsap.to(state, {
          v: to,
          duration: 1.8,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
          onUpdate() {
            const n = Math.round(state.v);
            el.textContent = useSep ? n.toLocaleString("pt-BR") : String(n);
          },
        });
      });

      gsap.utils.toArray<SVGPathElement>("[data-lp4-path]").forEach((path) => {
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(path, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: path.closest("section"),
            start: "top 70%",
            end: "bottom 55%",
            scrub: true,
          },
        });
      });
    });

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    document.fonts?.ready?.then(refresh).catch(() => {});

    return () => {
      window.removeEventListener("load", refresh);
      ctx.revert();
    };
  }, []);

  return null;
}
