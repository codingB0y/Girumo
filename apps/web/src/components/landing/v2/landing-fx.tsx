"use client";

import { useEffect } from "react";

/**
 * Orquestrador GSAP da landing — montado uma vez no fim da página.
 * Importa gsap dinamicamente (não pesa o LCP; a entrada do hero é CSS puro)
 * e liga tudo por data-attributes, mantendo a page.tsx como Server Component:
 *
 *  [data-reveal]        → fade+rise ao entrar na viewport
 *  [data-reveal-group]  → filhos revelam em stagger
 *  [data-parallax]      → deriva vertical sutil no scroll (screenshots)
 *  [data-mech]          → scrollytelling: ativa .lp-step / .lp-visual por índice
 *  [data-wall]          → muro de grupos: células acendem em cascata
 *  [data-magnetic]      → botão magnético (só ponteiro fino)
 *  [data-counter]       → número conta de 0 até data-counter
 */
export function LandingFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      // O CSS global usa scroll-behavior: smooth, que transforma os saltos
      // internos do ScrollTrigger (refresh/restore) em scrolls animados
      // fantasmas. Enquanto a landing está ativa: auto no CSS e âncoras
      // suaves via JS (window.scrollTo smooth funciona mesmo com CSS auto).
      const html = document.documentElement;
      const prevBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      cleanups.push(() => {
        html.style.scrollBehavior = prevBehavior;
      });
      const onAnchorClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
        if (!a) return;
        const target = document.querySelector(a.getAttribute("href") || "");
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top, behavior: "smooth" });
      };
      document.addEventListener("click", onAnchorClick);
      cleanups.push(() => document.removeEventListener("click", onAnchorClick));

      ScrollTrigger.clearScrollMemory("manual");
      ScrollTrigger.config({ ignoreMobileResize: true });

      ctx = gsap.context(() => {
        /* ---- reveals ---- */
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          gsap.from(el, {
            opacity: 0,
            y: 30,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 86%" },
          });
        });

        gsap.utils.toArray<HTMLElement>("[data-reveal-group]").forEach((group) => {
          gsap.from(group.children, {
            opacity: 0,
            y: 34,
            duration: 0.85,
            ease: "power3.out",
            stagger: 0.09,
            scrollTrigger: { trigger: group, start: "top 84%" },
          });
        });

        /* ---- parallax sutil ---- */
        gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
          const amount = Number(el.dataset.parallax || 40);
          gsap.fromTo(
            el,
            { y: amount },
            {
              y: -amount,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 },
            },
          );
        });

        /* ---- contadores ---- */
        gsap.utils.toArray<HTMLElement>("[data-counter]").forEach((el) => {
          const to = Number(el.dataset.counter || 0);
          const obj = { v: 0 };
          gsap.to(obj, {
            v: to,
            duration: 1.6,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 88%" },
            onUpdate: () => {
              el.textContent = Math.round(obj.v).toLocaleString("pt-BR");
            },
          });
        });

        /* ---- mecanismo (scrollytelling) ---- */
        const mech = document.querySelector<HTMLElement>("[data-mech]");
        if (mech) {
          const steps = Array.from(mech.querySelectorAll<HTMLElement>(".lp-step"));
          const visuals = Array.from(mech.querySelectorAll<HTMLElement>(".lp-visual"));
          const activate = (i: number) => {
            steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
            visuals.forEach((v, j) => v.classList.toggle("is-active", j === i));
          };
          activate(0);
          steps.forEach((step, i) => {
            ScrollTrigger.create({
              trigger: step,
              start: "top 62%",
              end: "bottom 62%",
              onEnter: () => activate(i),
              onEnterBack: () => activate(i),
            });
          });
        }

        /* ---- muro de grupos ---- */
        const wall = document.querySelector<HTMLElement>("[data-wall]");
        if (wall) {
          const cells = wall.querySelectorAll<HTMLElement>(".lp-cell");
          gsap.from(cells, {
            opacity: 0,
            scale: 0.35,
            duration: 0.55,
            ease: "back.out(1.8)",
            stagger: { each: 0.012, from: "center", grid: "auto" },
            scrollTrigger: { trigger: wall, start: "top 78%" },
          });
          // células "acendem" (gente entrando) em ondas depois de montar
          const lit = wall.querySelectorAll<HTMLElement>("[data-cell-lit]");
          ScrollTrigger.create({
            trigger: wall,
            start: "top 70%",
            once: true,
            onEnter: () => {
              lit.forEach((cell, i) => {
                gsap.delayedCall(0.5 + i * 0.07, () => {
                  cell.classList.add(cell.dataset.cellLit === "iris" ? "lp-cell-iris" : "lp-cell-on");
                });
              });
            },
          });
        }
      });

      /* ---- botões magnéticos (fora do gsap.context, cleanup manual) ---- */
      if (window.matchMedia("(pointer: fine)").matches) {
        document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((btn) => {
          const strength = 0.32;
          const onMove = (e: PointerEvent) => {
            const r = btn.getBoundingClientRect();
            const x = (e.clientX - r.left - r.width / 2) * strength;
            const y = (e.clientY - r.top - r.height / 2) * strength;
            gsap.to(btn, { x, y, duration: 0.4, ease: "power3.out" });
          };
          const onLeave = () => {
            gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
          };
          btn.addEventListener("pointermove", onMove);
          btn.addEventListener("pointerleave", onLeave);
          cleanups.push(() => {
            btn.removeEventListener("pointermove", onMove);
            btn.removeEventListener("pointerleave", onLeave);
          });
        });
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      ctx?.revert();
    };
  }, []);

  return null;
}
