/* eslint-disable @next/next/no-img-element */
import type { LpBenefit, LpMediaRef } from "@/lib/pages/content";
import { mediaSrc, mediaPosition } from "@/lib/pages/media";

/**
 * Vantagens (até 3) + galeria (2–6). As vantagens são paralelas, não uma
 * sequência — por isso levam um filete `wine` como marcador (assinatura editorial),
 * não numeração 01/02/03. A galeria fica abaixo da 1ª dobra: imagens LAZY com
 * dimensões reservadas (quadrado), servidas como derivado por `mediaSrc`.
 */
export function BenefitsGallerySection({
  benefits,
  gallery,
}: {
  benefits: LpBenefit[];
  gallery: LpMediaRef[];
}) {
  const hasBenefits = benefits.length > 0;
  const hasGallery = gallery.length > 0;
  if (!hasBenefits && !hasGallery) return null;

  return (
    <section className="bg-[#f8f5f0]">
      <div className="mx-auto w-full max-w-md px-5 py-14 lg:max-w-6xl lg:px-10 lg:py-20">
        {hasBenefits ? (
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[#e4dcd0] bg-[#e4dcd0] sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <div key={i} className="bg-[#f8f5f0] p-6">
                <span aria-hidden className="block h-px w-8 bg-[#6e2233]" />
                <h3 className="mt-4 font-serif text-lg text-[#17130f]">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6b6259]">{b.description}</p>
              </div>
            ))}
          </div>
        ) : null}

        {hasGallery ? (
          <div
            className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${hasBenefits ? "mt-10" : ""}`}
          >
            {gallery.map((g, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xl border border-[#e4dcd0] bg-[#f0ebe2]"
              >
                <img
                  src={mediaSrc(g)}
                  alt={g.alt}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ objectPosition: mediaPosition(g) }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
