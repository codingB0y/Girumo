import { Tag, Shirt, Package } from "lucide-react";
import type { LpBenefit, LpMediaRef } from "@/lib/pages/content";
import { LpImage } from "@/components/pages/templates/sections/lp-image";

/**
 * Ícones de linha das vantagens. O template é nichado em atacado de moda, então o
 * trio cobre os eixos reais da oferta: preço, produto e pedido. São ciclados por
 * posição — as vantagens são paralelas, não uma sequência (por isso não há
 * numeração 01/02/03).
 */
const ICONS = [Tag, Shirt, Package] as const;

/**
 * Vantagens (até 3) + galeria (2–6). Desktop: vantagens à esquerda em coluna e a
 * galeria à direita, como no modelo. Mobile: vantagens em três colunas compactas e
 * a galeria abaixo. A galeria fica abaixo da 1ª dobra: imagens LAZY com dimensões
 * reservadas (retrato 3:4), servidas como derivado por `mediaSrc`.
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
    <section className="bg-[#efe9df]">
      <div className="mx-auto w-full max-w-md px-6 py-12 lg:max-w-6xl lg:px-10 lg:py-16">
        <div
          className={
            hasBenefits && hasGallery
              ? "lg:grid lg:grid-cols-[minmax(0,290px)_1fr] lg:items-center lg:gap-12"
              : ""
          }
        >
          {hasBenefits ? (
            <div className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-7">
              {benefits.map((b, i) => {
                const Icon = ICONS[i % ICONS.length];
                return (
                  <div key={i} className="flex flex-col gap-2 lg:flex-row lg:gap-3.5">
                    <Icon
                      className="h-5 w-5 shrink-0 text-[color:var(--lp-accent)] lg:mt-0.5"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <div>
                      <h3 className="text-[13px] font-semibold leading-snug text-[#221a13] lg:text-[0.95rem]">
                        {b.title}
                      </h3>
                      <p className="mt-1 text-[11px] leading-snug text-[#6f6558] lg:text-sm lg:leading-relaxed">
                        {b.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {hasGallery ? (
            <div className={`grid grid-cols-3 gap-3 ${hasBenefits ? "mt-8 lg:mt-0" : ""}`}>
              {gallery.map((g, i) => (
                <div
                  key={i}
                  className="relative aspect-[3/4] overflow-hidden rounded-lg bg-[#e7dfd2]"
                >
                  <LpImage media={g} alt={g.alt} sizes="(min-width: 1024px) 25vw, 33vw" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
