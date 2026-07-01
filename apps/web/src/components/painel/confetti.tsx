"use client";

import { useEffect, useState } from "react";

const COLORS = ["#6a4bf0", "#8a6cff", "#1e8e5a", "#d99b2a", "#ff6b6b", "#ffd93d"];
const PARTICLE_COUNT = 50;

type Particle = {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
};

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.5,
    rotation: Math.random() * 360,
    size: 6 + Math.random() * 6,
  }));
}

/**
 * Confetti celebration. Dispara partículas de cima pra baixo.
 * Controlado por `show` — desaparece automaticamente após 3s.
 */
export function Confetti({ show, onDone }: { show: boolean; onDone?: () => void }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setParticles(generateParticles());
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [show, onDone]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.x}%`,
            top: "-10px",
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            borderRadius: "2px",
            transform: `rotate(${p.rotation}deg)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
