"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { LpProof } from "@/lib/pages/content";
import { embedUrl } from "@/lib/pages/video";
import { mediaSrc, mediaPosition } from "@/lib/pages/media";
import { TYPE } from "@/components/pages/templates/tokens";

/**
 * Prova social (depoimento 9:16) sobre fundo escuro (ink) para dar drama editorial.
 * Vídeo = facade: a capa aparece de imediato e o iframe de terceiros só é CRIADO
 * após o clique — equivalente ao `preload="none"` de <video> e sem autoplay com
 * áudio no load (o som só vem do gesto do usuário). Foto = retrato 9:16 estático.
 */
export function VideoProofSection({ proof }: { proof: NonNullable<LpProof> }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-[#17130f]">
      <div className="mx-auto grid w-full max-w-md gap-8 px-5 py-14 lg:max-w-5xl lg:grid-cols-[minmax(0,320px)_1fr] lg:items-center lg:gap-14 lg:px-10 lg:py-20">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-black">
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
                className="group absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
              >
                {proof.video.poster ? (
                  <img
                    src={mediaSrc(proof.video.poster)}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover opacity-55"
                    style={{ objectPosition: mediaPosition(proof.video.poster) }}
                    loading="lazy"
                  />
                ) : null}
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--lp-brand)] text-[color:var(--lp-on-brand)] transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-current" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className={`relative ${TYPE.meta} text-white/80`}>toque pra assistir</span>
              </button>
            )
          ) : (
            <img
              src={mediaSrc(proof.photo)}
              alt={proof.photo.alt || `Foto de ${proof.name}`}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: mediaPosition(proof.photo) }}
              loading="lazy"
            />
          )}
        </div>

        <figure className="text-[#f8f5f0]">
          <span aria-hidden className="block font-serif text-5xl leading-none text-[#8a3346]">
            &ldquo;
          </span>
          <blockquote className="mt-2 font-serif text-[1.4rem] leading-snug lg:text-[1.75rem]">
            {proof.quote}
          </blockquote>
          <figcaption className={`mt-5 ${TYPE.meta} text-white/60`}>
            {proof.name} · {proof.store} · {proof.city}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
