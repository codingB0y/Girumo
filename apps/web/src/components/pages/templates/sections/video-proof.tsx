"use client";

import { useState } from "react";
import type { LpProof } from "@/lib/pages/content";
import { embedUrl } from "@/lib/pages/video";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { TYPE } from "@/components/pages/templates/tokens";

/**
 * Prova social ("quem compra, recomenda") sobre o papel, em banda de tom levemente
 * diferente para dar ritmo editorial. Vídeo = facade: a capa aparece de imediato e
 * o iframe de terceiros só é CRIADO após o clique — equivalente ao `preload="none"`
 * de <video>, sem autoplay com áudio no load (o som vem do gesto do usuário).
 * Foto = retrato estático. Desktop: mídia à esquerda, citação à direita.
 */
export function VideoProofSection({ proof }: { proof: NonNullable<LpProof> }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-y border-[#ddd2c2] bg-[#e7dfd2]">
      <div className="mx-auto grid w-full max-w-md gap-7 px-6 py-12 lg:max-w-5xl lg:grid-cols-[minmax(0,300px)_1fr] lg:items-center lg:gap-12 lg:px-10 lg:py-16">
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-xl border border-[#ddd2c2] bg-[#221a13]">
          {proof.kind === "video" ? (
            open ? (
              <iframe
                src={embedUrl(proof.video.provider, proof.video.id, { autoplay: true })}
                title={`Depoimento de ${proof.name} — ${proof.store}`}
                allow="autoplay; fullscreen; picture-in-picture"
                className="absolute inset-0 h-full w-full"
              />
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`Assistir o depoimento de ${proof.name}, ${proof.store}`}
                className="group absolute inset-0 flex items-center justify-center"
              >
                {proof.video.poster ? (
                  <LpImage media={proof.video.poster} alt="" sizes="300px" />
                ) : null}
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-sm transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-[#221a13]" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span
                  aria-hidden
                  className="absolute bottom-2 right-2 rounded bg-[#221a13]/85 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-white"
                >
                  CC
                </span>
              </button>
            )
          ) : (
            <LpImage
              media={proof.photo}
              alt={proof.photo.alt || `Foto de ${proof.name}`}
              sizes="300px"
            />
          )}
        </div>

        <figure>
          <p className={`${TYPE.eyebrow} text-[color:var(--lp-accent)]`}>Quem compra, recomenda</p>
          <blockquote className="mt-3 font-serif text-[1.5rem] leading-snug text-[#221a13] lg:text-[1.9rem]">
            &ldquo;{proof.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-4 text-sm text-[#6f6558]">
            <span className="font-semibold text-[#221a13]">{proof.name}</span> — {proof.store},{" "}
            {proof.city}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
