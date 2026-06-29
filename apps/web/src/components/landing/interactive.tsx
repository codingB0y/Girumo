"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Revela o bloco com fade+rise quando entra na viewport (1x). Respeita reduced-motion via CSS. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("hf-reveal", visible && "is-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Conta um número de 0 até `to` ao entrar na viewport. Para números REAIS (não fabricados). */
export function Counter({
  to,
  prefix = "",
  suffix = "",
  duration = 1200,
  className,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {Math.round(value).toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}

type Shot = { src: string; label: string; caption: string };

/** Showcase do produto: abas em mono trocam a tela grande com cross-fade. Telas reais (Brand/UI). */
export function ProductShowcase({ shots }: { shots: Shot[] }) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {shots.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={active === i}
            className={cn(
              "font-data rounded-full px-4 py-2 text-xs uppercase tracking-wider transition",
              active === i
                ? "bg-iris text-white shadow-iris"
                : "bg-breu/[0.06] text-aco hover:bg-breu/10 hover:text-breu",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="hf-shot relative mt-6 aspect-[909/540] overflow-hidden rounded-2xl border border-breu/10 bg-breu-2">
        {shots.map((s, i) => (
          <Image
            key={s.src}
            src={s.src}
            alt={`HubFlow — ${s.label}`}
            width={909}
            height={540}
            priority={i === 0}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
              active === i ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>

      <p className="font-data mx-auto mt-4 max-w-xl text-center text-sm text-aco">
        {shots[active].caption}
      </p>
    </div>
  );
}
