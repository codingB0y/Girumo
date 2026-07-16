import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Muro de grupos — pano de fundo do CTA final.
 * Grade de células que o LandingFx monta em cascata e "acende"
 * (verde = grupo enchendo, Cobalt = grupo gerenciado) via [data-wall].
 */
const COLS = 14;
const ROWS = 7;

/** Determinístico (nada de Math.random no server) — padrão pseudo-aleatório estável. */
function cellKind(i: number): "on" | "cobalt" | "off" {
  const h = (i * 2654435761) % 97;
  if (h < 16) return "on";
  if (h < 24) return "cobalt";
  return "off";
}

export function GroupWall() {
  return (
    <div
      data-wall
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-60 [mask-image:radial-gradient(ellipse_78%_70%_at_50%_45%,#000_30%,transparent_75%)]"
    >
      <div
        className="grid h-full w-full gap-2.5 p-6 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: COLS * ROWS }).map((_, i) => {
          const kind = cellKind(i);
          return (
            <span
              key={i}
              className="lp-cell flex items-center justify-center"
              data-cell-lit={kind === "off" ? undefined : kind}
            >
              {kind === "on" && <WhatsAppIcon className="h-[38%] w-[38%] text-zap/70" />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
