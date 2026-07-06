"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Orquestrador GSAP da /lp — dirigido por data-attributes:
 *  [data-lp-hi]     entrada do hero (stagger)
 *  [data-lp-reveal] fade-up ao entrar na viewport
 *  [data-lp-zoom]   cards nascem levemente menores e assentam
 *  [data-lp-scrub]  parágrafo com palavras reveladas por scrub
 *  [data-lp-count]  contadores numéricos (data-to, data-sep)
 *  .lp3-stack-card  empilhamento: card anterior recua quando o próximo cobre
 *
 * Sem JS / prefers-reduced-motion: conteúdo 100% visível (estados iniciais
 * são aplicados aqui, nunca no CSS).
 */
export function LpFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // hero
      gsap.from("[data-lp-hi]", {
        y: 26,
        opacity: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.09,
        delay: 0.12,
      });

      // reveals
      gsap.utils.toArray<HTMLElement>("[data-lp-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 30,
          opacity: 0,
          duration: 1,
          ease: "power4.out",
          scrollTrigger: { trigger: el, start: "top 86%" },
        });
      });

      // zoom-in de cards
      gsap.utils.toArray<HTMLElement>("[data-lp-zoom]").forEach((el) => {
        gsap.from(el, {
          scale: 0.94,
          opacity: 0.4,
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        });
      });

      // scrub de palavras
      gsap.utils.toArray<HTMLElement>("[data-lp-scrub]").forEach((el) => {
        const words = (el.textContent ?? "").trim().split(/\s+/);
        el.textContent = "";
        const spans = words.map((w) => {
          const s = document.createElement("span");
          s.textContent = w;
          s.style.opacity = "0.14";
          el.appendChild(s);
          el.appendChild(document.createTextNode(" "));
          return s;
        });
        gsap.to(spans, {
          opacity: 1,
          stagger: 0.045,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top 76%", end: "bottom 42%", scrub: true },
        });
      });

      // contadores
      gsap.utils.toArray<HTMLElement>("[data-lp-count]").forEach((el) => {
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

      // empilhamento: quando o card seguinte sobe, o anterior recua
      const stack = gsap.utils.toArray<HTMLElement>(".lp3-stack-card");
      stack.forEach((card, i) => {
        const next = stack[i + 1];
        if (!next) return;
        gsap.to(card, {
          scale: 0.96,
          filter: "brightness(0.8)",
          transformOrigin: "center top",
          ease: "none",
          scrollTrigger: { trigger: next, start: "top 85%", end: "top 25%", scrub: true },
        });
      });
    });

    // fontes carregam depois do primeiro layout — recalcular gatilhos
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
