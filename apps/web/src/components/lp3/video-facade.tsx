"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface BazarVideoProps {
  /** Proporção/tamanho do card — o desktop usa 9:16, o mobile 4:5. */
  className?: string;
  /** Versão reduzida (play 64px), usada no card 4:5 do mobile. */
  compact?: boolean;
  description?: string;
}

/**
 * Facade de performance do vídeo do bazar (Vimeo 1207228037).
 * O iframe (3rd-party pesado) só carrega no clique — LCP fica no texto.
 * Pós-clique: autoplay com som (gesto do usuário permite).
 */
export function BazarVideo({
  className = "aspect-[9/16]",
  compact = false,
  description = "Loja cheia, fila na porta — evento avisado só nos grupos.",
}: BazarVideoProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("lp4-window relative w-full", className)}>
      {open ? (
        <iframe
          src="https://player.vimeo.com/video/1207228037?autoplay=1&loop=1&title=0&byline=0&portrait=0&dnt=1"
          allow="autoplay; fullscreen; picture-in-picture"
          title="Bazar Mega Stock — loja cheia durante o evento avisado nos grupos"
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Assistir o vídeo do bazar Mega Stock, 42 segundos"
          className={cn(
            "lp4-mesh group absolute inset-0 flex flex-col items-center justify-center p-8 text-center",
            compact ? "gap-[18px] p-6" : "gap-6",
          )}
        >
          <span className="lp4-mono text-[9px] text-[var(--body)] md:text-[10px]">
            prova em vídeo · 42s
          </span>
          <span className={cn("lp4-play", compact && "lp4-play-sm")} aria-hidden>
            <Play className={cn("fill-current", compact ? "ml-0.5 h-6 w-6" : "ml-1 h-7 w-7")} />
          </span>
          <span>
            <span className={cn("block font-bold tracking-tight", compact ? "text-lg" : "text-xl")}>
              O bazar de 2 dias
            </span>
            <span
              className={cn(
                "block leading-relaxed text-[var(--body)]",
                compact ? "mt-1.5 text-[13px]" : "mt-2 text-sm",
              )}
            >
              {description}
            </span>
          </span>
          <span className="lp4-mono text-[8px] text-[var(--body)] opacity-70 md:text-[9px]">
            toque pra assistir com som
          </span>
        </button>
      )}
    </div>
  );
}
