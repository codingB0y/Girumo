/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import type { LpContentV2, LpMediaRef } from "@/lib/pages/content";
import { mediaSrc } from "@/lib/pages/media";
import { LpImage } from "@/components/pages/templates/sections/lp-image";
import { TYPE } from "@/components/pages/templates/tokens";

/**
 * Assinatura da loja: nome em serif (na cor da marca) + selo curto como tagline
 * em mono espaçado — o lockup do modelo. Se a loja enviou logo, ela substitui o
 * nome. Aparece centralizado no topo (mobile) e no topo da coluna (desktop).
 */
function Wordmark({
  storeName,
  logo,
  badge,
}: {
  storeName: string;
  logo?: LpMediaRef | null;
  badge?: string;
}) {
  return (
    <div className="text-center">
      {logo ? (
        <img
          src={mediaSrc(logo)}
          alt={logo.alt || storeName}
          className="mx-auto h-10 w-auto lg:h-12"
          loading="eager"
        />
      ) : (
        <p className="font-serif text-2xl uppercase tracking-[0.14em] text-[color:var(--lp-accent)] lg:text-[1.75rem]">
          {storeName}
        </p>
      )}
      {badge ? <p className={`mt-1.5 ${TYPE.eyebrow} text-[#6f6558]`}>{badge}</p> : null}
    </div>
  );
}

/**
 * Hero editorial (Estrutura A — conversão imediata): identidade + oferta + mídia
 * com o formulário incorporado ao primeiro bloco (§6.1). A imagem é FULL-BLEED —
 * ocupa a metade esquerda inteira no desktop (sem borda/raio/padding) e o topo no
 * mobile — carregando EAGER com dimensões reservadas (anti-CLS). O texto fica à
 * esquerda e o lockup da loja centralizado, como no modelo.
 * `<img>` cru de propósito: domínio de mídia arbitrário (evita allowlist do
 * next/image); a origem já é um derivado servido por nós.
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
    <section className="bg-[#efe9df]">
      <div className="px-6 pt-8 lg:hidden">
        <Wordmark storeName={store_name} logo={logo} badge={badge} />
      </div>

      <div className="lg:grid lg:min-h-[640px] lg:grid-cols-2 lg:items-stretch">
        <figure className="relative mt-6 aspect-[16/11] w-full lg:mt-0 lg:aspect-auto lg:h-full">
          <LpImage
            media={hero}
            alt={hero.alt || `Foto de ${store_name}`}
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
        </figure>

        <div className="flex flex-col justify-center px-6 py-10 lg:px-14 lg:py-16">
          <div className="hidden lg:mb-8 lg:block">
            <Wordmark storeName={store_name} logo={logo} badge={badge} />
          </div>

          <h1 className={`text-[#221a13] ${TYPE.display}`}>{headline}</h1>
          <p className={`mt-4 max-w-prose text-[#6f6558] ${TYPE.lead}`}>{description}</p>

          <div className="mt-7">{formSlot}</div>
        </div>
      </div>
    </section>
  );
}
