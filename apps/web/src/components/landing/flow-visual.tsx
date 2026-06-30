"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Herói — a narrativa do HubFlow em uma imagem:
 *   1. GESTÃO: vários grupos de WhatsApp (verde), em ramificações, convergem por
 *      linhas que se desenham até um HUB HubFlow (Íris) central — "ele gerencia todos".
 *   2. DISPARO EM MASSA: do hub, pulsos viajam de volta para TODOS os grupos ao mesmo
 *      tempo (texto · vídeo · áudio) — "1 clique, todos os grupos".
 *   3. AUTO-CRIAÇÃO: quando um grupo enche, um novo nó "nasce" ramificado.
 *
 * Decorativo (aria-hidden). 100% SVG/CSS + SMIL. Respeita prefers-reduced-motion:
 * o desenho/entrada são tratados via @media no globals.css; o broadcast em loop
 * (SMIL) é desligado por JS quando o usuário pede menos movimento.
 */

type Group = { x: number; y: number; s: number; in: number; d: number; born?: boolean };

const HUB = { x: 360, y: 220 };
const EDGE = HUB.x - 60; // borda esquerda do hub (onde os grupos entram)

const GROUPS: Group[] = [
  { x: 64, y: 56, s: 1, in: 168, d: 0 },
  { x: 150, y: 116, s: 0.86, in: 190, d: 0.5 },
  { x: 40, y: 156, s: 1.04, in: 206, d: 0.9 },
  { x: 132, y: 232, s: 0.9, in: 236, d: 0.3 },
  { x: 48, y: 300, s: 1, in: 258, d: 0.7 },
  { x: 116, y: 366, s: 0.82, in: 282, d: 1.3, born: true }, // nasce depois (auto-criação)
];

function connector(g: Group) {
  const midX = (g.x + EDGE) / 2;
  return `M${g.x} ${g.y} C ${midX} ${g.y}, ${midX} ${g.in}, ${EDGE} ${g.in}`;
}

export function FlowVisual({ className }: { className?: string }) {
  const [motion, setMotion] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 480 430" fill="none" className="h-auto w-full" aria-hidden="true">
        <defs>
          <linearGradient id="hf-flow-iris" x1="0" y1="0" x2="480" y2="430" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A78CFF" />
            <stop offset="0.5" stopColor="#6A4BF0" />
            <stop offset="1" stopColor="#3D1FB0" />
          </linearGradient>
          <radialGradient id="hf-hub-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#6A4BF0" stopOpacity="0.45" />
            <stop offset="1" stopColor="#6A4BF0" stopOpacity="0" />
          </radialGradient>
          <mask id="hf-hub-link">
            <rect width="480" height="430" fill="white" />
            <path d={`M${HUB.x} ${HUB.y - 13} a10 10 0 0 1 0 26`} fill="none" stroke="black" strokeWidth="7" />
          </mask>
        </defs>

        {/* halo do hub */}
        <circle cx={HUB.x} cy={HUB.y} r="128" fill="url(#hf-hub-glow)" className="hf-breathe" />

        {/* ligações: cada grupo flui até o hub (desenham em sequência) */}
        {GROUPS.map((g, i) => (
          <path
            key={`l${i}`}
            id={`hf-path-${i}`}
            d={connector(g)}
            stroke="url(#hf-flow-iris)"
            strokeWidth="2"
            strokeOpacity={g.born ? 0.4 : 0.55}
            pathLength={1}
            className="hf-draw"
            style={{ animationDelay: `${0.3 + g.d * 0.16}s` }}
          />
        ))}

        {/* DISPARO EM MASSA: pulsos viajam do hub → todos os grupos, em loop */}
        {motion &&
          GROUPS.map((_, i) => (
            <circle key={`b${i}`} r="3.6" fill="#8A6CFF" opacity="0.9">
              <animateMotion
                dur="2s"
                begin={`${2 + i * 0.22}s`}
                repeatCount="indefinite"
                keyPoints="1;0"
                keyTimes="0;1"
                calcMode="linear"
              >
                <mpath href={`#hf-path-${i}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                dur="2s"
                begin={`${2 + i * 0.22}s`}
                repeatCount="indefinite"
                values="0;1;1;0"
                keyTimes="0;0.12;0.8;1"
              />
            </circle>
          ))}

        {/* pontos de entrada na borda do hub */}
        {GROUPS.map((g, i) => (
          <circle
            key={`in${i}`}
            cx={EDGE}
            cy={g.in}
            r="3.2"
            fill="#8A6CFF"
            className="hf-pop"
            style={{ animationDelay: `${1.2 + g.d * 0.14}s` }}
          />
        ))}

        {/* HUB HubFlow — gerencia e dispara para todos */}
        <g className="hf-pop" style={{ animationDelay: "1s" }}>
          <rect
            x={HUB.x - 60}
            y={HUB.y - 60}
            width="120"
            height="120"
            rx="30"
            fill="#11142A"
            stroke="#6A4BF0"
            strokeOpacity="0.55"
          />
          {/* anel que pulsa a cada disparo */}
          {motion && (
            <rect
              x={HUB.x - 60}
              y={HUB.y - 60}
              width="120"
              height="120"
              rx="30"
              fill="none"
              stroke="#8A6CFF"
              strokeWidth="2"
            >
              <animate attributeName="stroke-opacity" dur="2s" begin="1.8s" repeatCount="indefinite" values="0.8;0" keyTimes="0;1" />
              <animate attributeName="width" dur="2s" begin="1.8s" repeatCount="indefinite" values="120;150" keyTimes="0;1" />
              <animate attributeName="height" dur="2s" begin="1.8s" repeatCount="indefinite" values="120;150" keyTimes="0;1" />
              <animate attributeName="x" dur="2s" begin="1.8s" repeatCount="indefinite" values={`${HUB.x - 60};${HUB.x - 75}`} keyTimes="0;1" />
              <animate attributeName="y" dur="2s" begin="1.8s" repeatCount="indefinite" values={`${HUB.y - 60};${HUB.y - 75}`} keyTimes="0;1" />
            </rect>
          )}
          {/* símbolo da corrente (H) dentro do hub */}
          <g mask="url(#hf-hub-link)" stroke="url(#hf-flow-iris)" strokeWidth="7" fill="none">
            <rect x={HUB.x - 38} y={HUB.y - 30} width="40" height="60" rx="17" />
            <rect x={HUB.x - 2} y={HUB.y - 30} width="40" height="60" rx="17" />
          </g>
          <path d={`M${HUB.x} ${HUB.y - 13} a10 10 0 0 1 0 26`} fill="none" stroke="url(#hf-flow-iris)" strokeWidth="7" />
        </g>

        {/* chips de formato saindo do hub: texto · vídeo · áudio */}
        <g className="hf-pop" style={{ animationDelay: "1.6s" }}>
          <FormatChip x={HUB.x - 26} y={HUB.y - 92} label="texto" />
          <FormatChip x={HUB.x + 30} y={HUB.y - 92} label="vídeo" />
          <FormatChip x={HUB.x + 2} y={HUB.y + 80} label="áudio" />
        </g>

        {/* grupos de WhatsApp (origem) */}
        {GROUPS.map((g, i) => (
          <WhatsBubble key={`g${i}`} x={g.x} y={g.y} s={g.s} delay={g.d} born={g.born} />
        ))}
      </svg>
    </div>
  );
}

/** Chip pequeno indicando o formato que vai no disparo. */
function FormatChip({ x, y, label }: { x: number; y: number; label: string }) {
  const w = label.length * 6 + 18;
  return (
    <g transform={`translate(${x - w / 2} ${y})`}>
      <rect width={w} height="20" rx="10" fill="#11142A" stroke="#6A4BF0" strokeOpacity="0.4" />
      <text x={w / 2} y="14" textAnchor="middle" fill="#ECEBF5" fontSize="10" fontFamily="monospace" letterSpacing="0.5">
        {label}
      </text>
    </g>
  );
}

/** Nó de grupo: símbolo do WhatsApp (balão verde com rabinho + telefone branco). */
function WhatsBubble({ x, y, s, delay, born }: { x: number; y: number; s: number; delay: number; born?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="hf-drift" style={{ animationDelay: `${delay}s` }}>
        <g className="hf-pop" style={{ animationDelay: born ? "2.6s" : `${0.2 + delay * 0.14}s` }}>
          {/* logo do WhatsApp: borda branca (camada de baixo) */}
          <path d="M-9.5 16.5 L-20 22 L-15.5 12.5 Z" fill="#ffffff" />
          <circle r="20.5" fill="#ffffff" />
          {/* balão verde com rabinho (camada de cima) */}
          <path d="M-8.5 14.5 L-16.5 18.5 L-13.5 11.5 Z" fill="#25D366" />
          <circle r="18" fill="#25D366" />
          {/* telefone branco do WhatsApp, centralizado no balão */}
          <g transform="translate(-8.5 -9) scale(0.72)" fill="#ffffff">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </g>
          {/* selo "+" de grupo recém-criado automaticamente */}
          {born && (
            <g transform="translate(16 -16)">
              <circle r="8" fill="#6A4BF0" stroke="#ffffff" strokeWidth="1.5" />
              <path d="M-3.5 0 H3.5 M0 -3.5 V3.5" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          )}
        </g>
      </g>
    </g>
  );
}
