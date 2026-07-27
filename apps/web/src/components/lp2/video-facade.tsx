"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Facade de performance do vídeo do bazar (Vimeo 1207228037).
 * O iframe (3rd-party pesado) só carrega no clique — LCP fica no texto.
 * Pós-clique: autoplay com som (gesto do usuário permite).
 */
export function BazarVideo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lp4-window relative aspect-[9/16] w-full">
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
          className="lp4-mesh group absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center"
        >
          <span className="lp4-mono text-[10px] text-[var(--body)]">prova em vídeo · 42s</span>
          <span className="lp4-play" aria-hidden>
            <Play className="ml-1 h-7 w-7 fill-current" />
          </span>
          <span>
            <span className="block text-xl font-bold tracking-tight">O bazar de 2 dias</span>
            <span className="mt-2 block text-sm leading-relaxed text-[var(--body)]">
              Loja cheia, fila na porta — evento avisado só nos grupos.
            </span>
          </span>
          <span className="lp4-mono text-[9px] text-[var(--body)] opacity-70">
            toque pra assistir com som
          </span>
        </button>
      )}
    </div>
  );
}
