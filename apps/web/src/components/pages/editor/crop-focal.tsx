"use client";

/* eslint-disable @next/next/no-img-element */
import { useId } from "react";
import type { LpMediaRef } from "@/lib/pages/content";
import { mediaSrc, mediaPosition } from "@/lib/pages/media";

/**
 * Ponto focal da imagem (§7.4). Não cortamos o arquivo: a mesma imagem é servida
 * em proporções diferentes (16/11 no hero mobile, coluna inteira no desktop, 3/4
 * na galeria) e o `object-position` decide o que sobrevive ao corte do CSS. Por
 * isso a lojista marca ONDE está o assunto, e não recorta na mão — um corte fixo
 * quebraria em uma das proporções.
 *
 * Interação: clique/arraste no ponto para o mouse; setas do teclado para quem não
 * usa mouse (a11y AA — controle nativo `range` seria dois eixos separados).
 */

const STEP = 0.05;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function CropFocal({
  media,
  onChange,
  disabled = false,
}: {
  media: LpMediaRef;
  onChange: (ref: LpMediaRef) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const x = media.focal_x ?? 0.5;
  const y = media.focal_y ?? 0.5;

  function moveTo(nextX: number, nextY: number) {
    if (disabled) return;
    onChange({ ...media, focal_x: clamp01(nextX), focal_y: clamp01(nextY) });
  }

  function handlePointer(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled || (e.type === "pointermove" && e.buttons !== 1)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    moveTo((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = delta[e.key];
    if (!move) return;
    e.preventDefault();
    moveTo(x + move[0], y + move[1]);
  }

  return (
    <div>
      <p id={labelId} className="text-xs font-medium text-aco/70">
        Ponto de interesse{" "}
        <span className="font-normal text-aco/50">
          — marque o assunto da foto; é o que fica visível quando a imagem é cortada
        </span>
      </p>

      <div
        role="application"
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-pos`}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
        onKeyDown={handleKey}
        className="relative mt-1.5 aspect-[16/10] w-full cursor-crosshair touch-none overflow-hidden rounded-xl bg-canvas-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <img
          src={mediaSrc(media)}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: mediaPosition(media) }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cobalt-500/30 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        />
      </div>

      <p id={`${labelId}-pos`} className="font-data mt-1 text-[11px] text-aco/50">
        {Math.round(x * 100)}% · {Math.round(y * 100)}% — use as setas do teclado para ajustar
      </p>
    </div>
  );
}
