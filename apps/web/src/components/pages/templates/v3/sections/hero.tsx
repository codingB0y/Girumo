import type { ReactNode } from "react";
import type { HeroSection } from "@/lib/pages/sections";
import type { LpMediaRef } from "@/lib/pages/content";
import { mediaSrc } from "@/lib/pages/media";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { Highlighted, Pill, Wrap } from "@/components/pages/templates/v3/primitives";
import { T } from "@/components/pages/templates/v3/tokens";

/* eslint-disable @next/next/no-img-element */
function Wordmark({ storeName, logo }: { storeName: string; logo?: LpMediaRef | null }) {
  if (logo) {
    return (
      <img
        src={mediaSrc(logo)}
        alt={logo.alt || storeName}
        width={160}
        height={40}
        className="h-9 w-auto object-contain lg:h-10"
        loading="eager"
        fetchPriority="high"
      />
    );
  }
  return (
    <p className="[font-family:var(--lp-font-display)] text-lg font-bold uppercase tracking-[0.12em] text-[color:var(--lp-ink)]">
      {storeName}
    </p>
  );
}

/**
 * Abertura da direção impacto (Estrutura "form no hero", como Fórmula de
 * Lançamento, Yield e Aula Magna): marca no topo, selo, título com um trecho na
 * cor da marca, frase de apoio e o formulário logo abaixo, à esquerda; a foto
 * (opcional) à direita, com uma luz na cor da marca atrás. Sem foto o texto
 * ocupa a largura toda — o tipo sustenta a dobra sozinho.
 *
 * Mobile: marca → selo → título → texto → formulário → foto. A foto desce de
 * propósito: a promessa e o pedido vêm antes (§2, é de onde vem o tráfego).
 */
export function HeroImpacto({
  section,
  storeName,
  logo,
  formSlot,
}: {
  section: HeroSection;
  storeName: string;
  logo?: LpMediaRef | null;
  formSlot: ReactNode;
}) {
  const { badge, headline, highlight, description, media } = section.data;

  return (
    <section className="relative overflow-hidden bg-[var(--lp-bg)]">
      {/* luz da marca atrás da foto / do canto — sutil, só transform/opacity */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--lp-brand-glow), transparent 70%)" }}
      />

      <Wrap className="relative pb-14 pt-8 lg:pb-24 lg:pt-10">
        <div className="flex items-center justify-between gap-4">
          <Wordmark storeName={storeName} logo={logo} />
          {badge ? (
            <span className="hidden lg:inline-flex">
              <Pill tone="brand">{badge}</Pill>
            </span>
          ) : null}
        </div>

        <div className={media ? "mt-10 lg:grid lg:grid-cols-12 lg:items-center lg:gap-12" : "mt-10"}>
          <div className={media ? "lg:col-span-7" : "lg:max-w-3xl"}>
            {badge ? (
              <span className="mb-5 inline-flex lg:hidden">
                <Pill tone="brand">{badge}</Pill>
              </span>
            ) : null}

            <h1 className={`${T.display} text-balance`}>
              <Highlighted text={headline} highlight={highlight} />
            </h1>
            <p className={`mt-5 max-w-prose ${T.lead}`}>{description}</p>

            <div className="mt-8 max-w-lg rounded-2xl border border-[color:var(--lp-line)] bg-[var(--lp-surface)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5">
              {formSlot}
            </div>
          </div>

          {media ? (
            <figure className="relative mt-10 aspect-[4/5] w-full overflow-hidden rounded-[1.75rem] border border-[color:var(--lp-line)] lg:col-span-5 lg:mt-0">
              <LpImage
                media={media}
                alt={media.alt || `Foto de ${storeName}`}
                priority
                sizes="(min-width: 1024px) 40vw, 100vw"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--lp-bg)]/70 to-transparent"
              />
            </figure>
          ) : null}
        </div>
      </Wrap>
    </section>
  );
}
