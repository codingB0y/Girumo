import { cn } from "@/lib/utils";

/**
 * Hero — a narrativa do produto: vários GRUPOS DE WHATSAPP dispersos (verde) convergem,
 * por linhas que se desenham, para um HUB HubFlow (Íris) que gerencia todos de uma vez.
 * Decorativo (aria-hidden). 100% SVG/CSS, respeita prefers-reduced-motion.
 *
 * Nota de animação: nunca por `hf-drift`/`hf-pop` (que animam transform via CSS) no mesmo
 * elemento que tem `transform=` de posição — o CSS sobrescreve o atributo. Por isso a posição
 * fica num <g> externo e as animações em <g>s internos.
 */
export function FlowVisual({ className }: { className?: string }) {
  const HUB = { x: 360, y: 210 };
  const edge = HUB.x - 58; // borda esquerda do hub (onde os grupos entram)

  // grupos de WhatsApp (origem) → y do ponto de entrada no hub (destino)
  const groups = [
    { x: 58, y: 70, s: 1, in: 176, d: 0 },
    { x: 150, y: 128, s: 0.9, in: 196, d: 0.6 },
    { x: 44, y: 198, s: 1.05, in: 216, d: 1.1 },
    { x: 118, y: 300, s: 0.85, in: 244, d: 0.4 },
  ];

  return (
    <div className={cn("relative", className)}>
      <svg viewBox="0 0 480 420" fill="none" className="h-auto w-full" aria-hidden="true">
        <defs>
          <linearGradient id="hf-flow-iris" x1="0" y1="0" x2="480" y2="420" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A78CFF" />
            <stop offset="0.5" stopColor="#6A4BF0" />
            <stop offset="1" stopColor="#3D1FB0" />
          </linearGradient>
          <radialGradient id="hf-hub-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#6A4BF0" stopOpacity="0.5" />
            <stop offset="1" stopColor="#6A4BF0" stopOpacity="0" />
          </radialGradient>
          <mask id="hf-hub-link">
            <rect width="480" height="420" fill="white" />
            <path d={`M${HUB.x} ${HUB.y - 13} a10 10 0 0 1 0 26`} fill="none" stroke="black" strokeWidth="7" />
          </mask>
        </defs>

        {/* halo do hub */}
        <circle cx={HUB.x} cy={HUB.y} r="120" fill="url(#hf-hub-glow)" className="hf-breathe" />

        {/* linhas: cada grupo flui até o hub (desenham em sequência) */}
        {groups.map((g, i) => (
          <path
            key={`l${i}`}
            d={`M${g.x} ${g.y} Q ${(g.x + edge) / 2} ${g.y}, ${edge} ${g.in}`}
            stroke="url(#hf-flow-iris)"
            strokeWidth="2"
            strokeOpacity="0.55"
            pathLength={1}
            className="hf-draw"
            style={{ animationDelay: `${0.3 + g.d * 0.18}s` }}
          />
        ))}

        {/* HUB HubFlow — gerencia todos de uma vez */}
        <g className="hf-pop" style={{ animationDelay: "1.2s" }}>
          <rect
            x={HUB.x - 58}
            y={HUB.y - 58}
            width="116"
            height="116"
            rx="28"
            fill="#11142A"
            stroke="#6A4BF0"
            strokeOpacity="0.5"
          />
          {/* símbolo da corrente (H) dentro do hub */}
          <g mask="url(#hf-hub-link)" stroke="url(#hf-flow-iris)" strokeWidth="7" fill="none">
            <rect x={HUB.x - 36} y={HUB.y - 28} width="38" height="56" rx="16" />
            <rect x={HUB.x - 2} y={HUB.y - 28} width="38" height="56" rx="16" />
          </g>
          <path
            d={`M${HUB.x} ${HUB.y - 13} a10 10 0 0 1 0 26`}
            fill="none"
            stroke="url(#hf-flow-iris)"
            strokeWidth="7"
          />
        </g>

        {/* pontos de entrada na borda do hub */}
        {groups.map((g, i) => (
          <circle
            key={`in${i}`}
            cx={edge}
            cy={g.in}
            r="3.5"
            fill="#8A6CFF"
            className="hf-pop"
            style={{ animationDelay: `${1.3 + g.d * 0.15}s` }}
          />
        ))}

        {/* grupos de WhatsApp (origem) */}
        {groups.map((g, i) => (
          <WhatsBubble key={`g${i}`} x={g.x} y={g.y} s={g.s} delay={g.d} />
        ))}
      </svg>
    </div>
  );
}

/** Bolha de grupo de WhatsApp: balão verde com 3 pontinhos (grupo/conversa) + rabinho. */
function WhatsBubble({ x, y, s, delay }: { x: number; y: number; s: number; delay: number }) {
  return (
    // posição estática (atributo transform) — sem classe de animação aqui
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="hf-drift" style={{ animationDelay: `${delay}s` }}>
        <g className="hf-pop" style={{ animationDelay: `${0.2 + delay * 0.15}s` }}>
          <rect x="-20" y="-17" width="40" height="32" rx="13" fill="#25D366" />
          <path d="M-9 13 L-18 22 L-3 16 Z" fill="#25D366" />
          <circle cx="-9" cy="-1" r="2.6" fill="#ffffff" />
          <circle cx="0" cy="-1" r="2.6" fill="#ffffff" />
          <circle cx="9" cy="-1" r="2.6" fill="#ffffff" />
        </g>
      </g>
    </g>
  );
}
