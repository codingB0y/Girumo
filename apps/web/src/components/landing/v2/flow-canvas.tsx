"use client";

import { useEffect, useRef } from "react";

/**
 * "O fluxo" — assinatura visual do hero.
 * Partículas (leads) escoam pelo campo e são absorvidas por nós de grupo:
 * íris enquanto viajam, pulso verde-WhatsApp ao entrar. O ponteiro curva o fluxo.
 *
 * Performance: canvas 2D (~4KB), DPR cap 1.5, pausa fora da viewport/aba oculta.
 * Mobile (<768px), reduced-motion ou pouca memória → não monta o loop
 * (o hero tem glow CSS por trás, então nada quebra).
 */
export function FlowCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 767px)").matches;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (reduced || small || (mem !== undefined && mem <= 2)) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = 0;
    let H = 0;
    let raf = 0;
    let running = true;
    let visible = true;

    type Sink = { x: number; y: number; r: number; pulse: number; count: number };
    type P = {
      x: number; y: number; vx: number; vy: number;
      sink: number; life: number; seed: number;
    };

    let sinks: Sink[] = [];
    const parts: P[] = [];
    const N = 130;
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      // nós de grupo num arco discreto perto da base (longe dos CTAs)
      const cx = W / 2;
      const baseY = H * 0.88;
      sinks = [
        { x: cx - W * 0.32, y: baseY - H * 0.03, r: 10, pulse: 0, count: 0 },
        { x: cx - W * 0.12, y: baseY + H * 0.02, r: 13, pulse: 0, count: 0 },
        { x: cx + W * 0.11, y: baseY - H * 0.01, r: 11, pulse: 0, count: 0 },
        { x: cx + W * 0.31, y: baseY + H * 0.03, r: 9, pulse: 0, count: 0 },
      ];
    };

    const spawn = (p?: P): P => {
      // nasce nas bordas superiores/laterais
      const side = Math.random();
      let x: number, y: number;
      if (side < 0.55) { x = Math.random() * W; y = -12; }
      else if (side < 0.78) { x = -12; y = Math.random() * H * 0.6; }
      else { x = W + 12; y = Math.random() * H * 0.6; }
      const np: P = p ?? ({} as P);
      np.x = x;
      np.y = y;
      np.vx = (Math.random() - 0.5) * 0.4;
      np.vy = Math.random() * 0.4 + 0.2;
      np.sink = Math.floor(Math.random() * sinks.length);
      np.life = 0;
      np.seed = Math.random() * 1000;
      return np;
    };

    resize();
    for (let i = 0; i < N; i++) {
      const p = spawn();
      // espalha o estado inicial pra não nascer tudo junto
      p.x = Math.random() * W;
      p.y = Math.random() * H * 0.7;
      parts.push(p);
    }

    let t = 0;
    const tick = () => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      t += 0.008;

      // fade do frame anterior mantendo transparência (trilhas)
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, W, H);
      // nós de grupo — desenhados sem blend aditivo (são estáticos; com
      // "lighter" o brilho acumularia frame a frame até estourar)
      ctx.globalCompositeOperation = "source-over";
      for (const s of sinks) {
        s.pulse *= 0.93;
        const glow = 0.08 + s.pulse * 0.22;
        const rr = s.r + s.pulse * 6;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr * 1.9);
        if (s.pulse > 0.12) {
          g.addColorStop(0, `rgba(37, 211, 102, ${glow})`);
          g.addColorStop(1, "rgba(37, 211, 102, 0)");
        } else {
          g.addColorStop(0, `rgba(200, 206, 235, ${glow})`);
          g.addColorStop(1, "rgba(200, 206, 235, 0)");
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr * 1.9, 0, Math.PI * 2);
        ctx.fill();
        // anel
        ctx.strokeStyle = s.pulse > 0.12
          ? `rgba(37, 211, 102, ${0.35 + s.pulse * 0.4})`
          : "rgba(220, 224, 245, 0.28)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "lighter";

      // partículas
      for (const p of parts) {
        const s = sinks[p.sink];
        p.life += 0.004;

        // atração ao nó + ondulação de campo
        const dx = s.x - p.x;
        const dy = s.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const pull = Math.min(0.045, 12 / dist);
        p.vx += (dx / dist) * pull + Math.sin(t * 2 + p.seed + p.y * 0.008) * 0.012;
        p.vy += (dy / dist) * pull + Math.cos(t * 1.6 + p.seed + p.x * 0.008) * 0.012;

        // ponteiro repele suavemente (interatividade)
        const mdx = p.x - mouse.x;
        const mdy = p.y - mouse.y;
        const md = Math.hypot(mdx, mdy);
        if (md < 130) {
          const f = (1 - md / 130) * 0.5;
          p.vx += (mdx / (md || 1)) * f;
          p.vy += (mdy / (md || 1)) * f;
        }

        // limita velocidade
        const sp = Math.hypot(p.vx, p.vy);
        const max = 1.7;
        if (sp > max) { p.vx = (p.vx / sp) * max; p.vy = (p.vy / sp) * max; }

        p.x += p.vx;
        p.y += p.vy;

        // chegou no grupo → pulso verde e renasce
        if (dist < s.r + 3) {
          s.pulse = 1;
          s.count++;
          spawn(p);
          continue;
        }
        if (p.x < -30 || p.x > W + 30 || p.y > H + 30 || p.life > 1.6) {
          spawn(p);
          continue;
        }

        const near = dist < 110;
        const a = Math.min(0.7, 0.22 + p.life * 0.45);
        ctx.fillStyle = near
          ? `rgba(37, 211, 102, ${a})`
          : `rgba(205, 210, 238, ${a * 0.65})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, near ? 1.8 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };

    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(canvas);
    const onVis = () => { visible = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave);

    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
