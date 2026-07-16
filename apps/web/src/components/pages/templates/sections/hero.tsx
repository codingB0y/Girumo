/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import type { LpContentV2 } from "@/lib/pages/content";
import { mediaSrc, mediaPosition } from "@/lib/pages/media";
import { TYPE } from "@/components/pages/templates/tokens";

/**
 * Hero editorial (Estrutura A — conversão imediata). Identidade + oferta + mídia
 * com o formulário incorporado ao primeiro bloco (§6.1 do design). Mobile: coluna
 * única (imagem, depois texto e form); desktop: texto+form à esquerda e a imagem
 * protagonista à direita. A imagem carrega EAGER com dimensões reservadas (CLS).
 * `<img>` cru de propósito: o domínio da mídia é arbitrário (evita allowlist do
 * next/image), e a origem já é um derivado servido por nós.
 */
export function HeroSection({
  content,
  formSlot,
}: {
  content: LpContentV2;
  formSlot: ReactNode;
}) {
  const { store_name, logo, badge, headline, description, hero } = content;

  return (
    <section className="border-b border-[#e4dcd0] bg-[#f8f5f0]">
      <div className="mx-auto grid w-full max-w-md gap-8 px-5 py-12 lg:max-w-6xl lg:grid-cols-2 lg:items-center lg:gap-14 lg:px-10 lg:py-20">
        <div className="order-2 lg:order-1">
          <div className="flex items-center gap-3">
            {logo ? (
              <img
                src={mediaSrc(logo)}
                alt={logo.alt || `Logo de ${store_name}`}
                className="h-9 w-auto"
                width={120}
                height={36}
                loading="eager"
              />
            ) : null}
            <span className={`${TYPE.meta} text-[#6b6259]`}>{store_name}</span>
          </div>

          {badge ? (
            <p
              className={`mt-6 inline-flex rounded-full bg-[var(--lp-brand-soft)] px-3 py-1 ${TYPE.eyebrow} text-[color:var(--lp-accent)]`}
            >
              {badge}
            </p>
          ) : null}

          <h1 className={`mt-5 text-[#17130f] ${TYPE.display}`}>{headline}</h1>
          <p className={`mt-5 max-w-prose text-[#6b6259] ${TYPE.lead}`}>{description}</p>

          <div className="mt-8">{formSlot}</div>
        </div>

        <figure className="order-1 lg:order-2">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-[#e4dcd0] bg-[#f0ebe2]">
            <img
              src={mediaSrc(hero)}
              alt={hero.alt || `Foto de ${store_name}`}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: mediaPosition(hero) }}
              loading="eager"
              fetchPriority="high"
            />
          </div>
        </figure>
      </div>
    </section>
  );
}
