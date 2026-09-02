"use client";

import { useState } from "react";
import type { LpMediaRef } from "@/lib/pages/content";
import { embedUrl, type LpVideoProvider } from "@/lib/pages/video";
import { LpImage } from "@/components/pages/templates/sections/lp-image";

/**
 * Facade de vídeo (mesma regra da editorial v2): a capa aparece de imediato e o
 * iframe de terceiros só é CRIADO após o clique — nada de autoplay com áudio no
 * load, e a CSP da página pública não muda até a pessoa pedir o vídeo.
 */
export function VideoFacade({
  provider,
  id,
  poster,
  title,
}: {
  provider: LpVideoProvider;
  id: string;
  poster?: LpMediaRef | null;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <iframe
        src={embedUrl(provider, id, { autoplay: true })}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture"
        className="absolute inset-0 h-full w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Assistir: ${title}`}
      className="group absolute inset-0 flex items-center justify-center"
    >
      {poster ? <LpImage media={poster} alt="" sizes="(min-width: 1024px) 320px, 100vw" /> : null}
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-sm transition group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-[#221a13]" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  );
}
