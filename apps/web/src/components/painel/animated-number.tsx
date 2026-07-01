"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anima um número de 0 até `value` em ~600ms com easing.
 * Usa requestAnimationFrame pra performance smooth.
 */
export function AnimatedNumber({
  value,
  duration = 600,
  className,
  formatter,
}: {
  value: number;
  duration?: number;
  className?: string;
  formatter?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = prevValue.current;
    const diff = value - start;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = value;
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  const formatted = formatter ? formatter(display) : display.toLocaleString("pt-BR");

  return <span className={className}>{formatted}</span>;
}
