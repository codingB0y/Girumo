"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Orquestrador GSAP da /lp2 — dirigido por data-attributes:
 *  [data-lp4-hi]        entrada do hero (stagger simples)
 *  [data-lp4-split]     título revelado palavra a palavra (máscara)
 *  [data-lp4-magnetic]  botão que "puxa" o cursor (quickTo elástico)
 *  [data-lp4-tilt]      tilt 3D seguindo o mouse (janela focal)
 *  [data-lp4-r]         fade-up ao entrar na viewport
 *  [data-lp4-w]         janelas de produto assentam (scale/settle)
 *  [data-lp4-photo]     foto real: clip-reveal + scale (do 1.16 pro 1.0)
 *  [data-lp4-parallax]  drift vertical por scroll (data-speed, default 0.12)
 *  [data-lp4-c]         contadores (data-to, data-sep)
 *  [data-lp4-path]      linha da esteira desenhada por scrub (SVG path)
 *
 * Sem JS / prefers-reduced-motion: conteúdo 100% visível.
 * Estados iniciais só via GSAP — nunca escondidos no CSS.
 */
export function Lp2Fx() {
  useEffect(() => {
    // ---- escala do mockup de painel (sempre ativo, independe de motion) ----
    const panelFit = document.querySelector<HTMLElement>(".lp4-panelfit");
    const panelScale = panelFit?.querySelector<HTMLElement>(".lp4-panelscale") ?? null;
    let panelRO: ResizeObserver | undefined;
    if (panelFit && panelScale) {
      const applyPanelScale = () => {
        panelScale.style.transform = `scale(${panelFit.clientWidth / 960})`;
      };
      applyPanelScale();
      panelRO = new ResizeObserver(applyPanelScale);
      panelRO.observe(panelFit);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => panelRO?.disconnect();
    }

    gsap.registerPlugin(ScrollTrigger);

    const cleanups: Array<() => void> = [];

    const ctx = gsap.context(() => {
      // ---- hero: stagger simples nos elementos marcados ----
      gsap.from("[data-lp4-hi]", {
        y: 24,
        opacity: 0,
        duration: 0.9,
        ease: "power4.out",
        stagger: 0.08,
        delay: 0.15,
      });

      // ---- título: reveal palavra a palavra dentro de máscara ----
      // Element-aware: preserva spans internos (ex.: a palavra verde) carregando
      // a className de origem em cada palavra.
      gsap.utils.toArray<HTMLElement>("[data-lp4-split]").forEach((el) => {
        const inners: HTMLElement[] = [];
        const wrapText = (text: string, className: string) => {
          for (const chunk of text.split(/(\s+)/)) {
            if (chunk === "") continue;
            if (chunk.trim() === "") {
              el.appendChild(document.createTextNode(chunk));
              continue;
            }
            const mask = document.createElement("span");
            mask.style.display = "inline-block";
            mask.style.overflow = "hidden";
            mask.style.verticalAlign = "top";
            const inner = document.createElement("span");
            inner.style.display = "inline-block";
            inner.style.willChange = "transform";
            if (className) inner.className = className;
            inner.textContent = chunk;
            mask.appendChild(inner);
            el.appendChild(mask);
            inners.push(inner);
          }
        };
        const nodes = Array.from(el.childNodes);
        el.textContent = "";
        for (const node of nodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            wrapText(node.textContent ?? "", "");
          } else if (node instanceof HTMLElement) {
            wrapText(node.textContent ?? "", node.className);
          }
        }
        gsap.from(inners, {
          yPercent: 118,
          duration: 0.85,
          ease: "expo.out",
          stagger: 0.055,
          delay: 0.1,
        });
      });

      // ---- botões magnéticos ----
      gsap.utils.toArray<HTMLElement>("[data-lp4-magnetic]").forEach((el) => {
        el.style.willChange = "transform";
        const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "elastic.out(1,0.4)" });
        const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "elastic.out(1,0.4)" });
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          xTo((e.clientX - r.left - r.width / 2) * 0.32);
          yTo((e.clientY - r.top - r.height / 2) * 0.4);
        };
        const onLeave = () => {
          xTo(0);
          yTo(0);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", onLeave);
        });
      });

      // ---- tilt 3D (janela focal do hero) ----
      gsap.utils.toArray<HTMLElement>("[data-lp4-tilt]").forEach((el) => {
        gsap.set(el, { transformPerspective: 1000, transformStyle: "preserve-3d" });
        const rx = gsap.quickTo(el, "rotationX", { duration: 0.6, ease: "power3.out" });
        const ry = gsap.quickTo(el, "rotationY", { duration: 0.6, ease: "power3.out" });
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          rx(-py * 7);
          ry(px * 9);
        };
        const onLeave = () => {
          rx(0);
          ry(0);
        };
        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", onLeave);
        });
      });

      // ---- reveals suaves ----
      gsap.utils.toArray<HTMLElement>("[data-lp4-r]").forEach((el) => {
        gsap.from(el, {
          y: 26,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
        });
      });

      // ---- janelas de produto assentam ----
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

      // ---- fotos reais: clip-reveal + scale ----
      gsap.utils.toArray<HTMLElement>("[data-lp4-photo]").forEach((el) => {
        const img = el.querySelector<HTMLElement>("img") ?? el;
        gsap.set(el, { clipPath: "inset(0 0 100% 0)" });
        gsap.set(img, { scale: 1.16 });
        gsap
          .timeline({ scrollTrigger: { trigger: el, start: "top 84%" } })
          .to(el, { clipPath: "inset(0 0 0% 0)", duration: 1.05, ease: "power4.out" })
          .to(img, { scale: 1, duration: 1.4, ease: "power3.out" }, 0);
      });

      // ---- parallax drift ----
      gsap.utils.toArray<HTMLElement>("[data-lp4-parallax]").forEach((el) => {
        const speed = Number(el.dataset.speed ?? "0.12");
        gsap.to(el, {
          yPercent: -speed * 100,
          ease: "none",
          scrollTrigger: {
            trigger: el.closest("section") ?? el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      // ---- contadores ----
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

      // ---- linha da esteira (SVG scrub) ----
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
      panelRO?.disconnect();
      window.removeEventListener("load", refresh);
      cleanups.forEach((fn) => fn());
      ctx.revert();
    };
  }, []);

  return null;
}
