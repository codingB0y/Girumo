import { Fragment, type ReactNode } from "react";
import { Bricolage_Grotesque, Fraunces } from "next/font/google";
import type { LpContentV3 } from "@/lib/pages/content-v3";
import type { LpSection, UrgencySection } from "@/lib/pages/sections";
import { deriveDarkPalette, derivePalette, type AccessiblePalette } from "@/lib/pages/palette";
import { LeadFormFields } from "@/components/pages/templates/sections/lead-form-fields";
import { StickyCta } from "@/components/pages/templates/sections/sticky-cta";
import { directionBackground, directionStyle } from "@/components/pages/templates/v3/tokens";
import { HeroImpacto } from "@/components/pages/templates/v3/sections/hero";
import { UrgencyBand, UrgencyTopBar } from "@/components/pages/templates/v3/sections/urgency";
import { Deliverables } from "@/components/pages/templates/v3/sections/deliverables";
import { Audience } from "@/components/pages/templates/v3/sections/audience";
import { Proof } from "@/components/pages/templates/v3/sections/proof";
import { Gallery } from "@/components/pages/templates/v3/sections/gallery";
import { About } from "@/components/pages/templates/v3/sections/about";
import { Schedule } from "@/components/pages/templates/v3/sections/schedule";
import { AfterSignup, WhyFree } from "@/components/pages/templates/v3/sections/text-block";
import { CtaBand } from "@/components/pages/templates/v3/sections/cta-band";
import { Faq } from "@/components/pages/templates/v3/sections/faq";
import { FooterV3 } from "@/components/pages/templates/v3/sections/footer";

/**
 * Display da direção impacto. `next/font` baixa e serve a fonte do nosso domínio
 * no build — nada externo em runtime, então a CSP da LP pública fica igual.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--lp-font-display",
  display: "swap",
});

/** Display da direção editorial: serifa de moda com eixo óptico (papel + serifa). */
const displaySerif = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--lp-font-display",
  display: "swap",
});

/** Só se `brand_color` for inválido (não deve ocorrer em v3 publicado). */
const FALLBACK_PALETTE: AccessiblePalette = {
  brand: "#2e66ff",
  accent: "#7fa2ff",
  onBrand: "#ffffff",
  adjusted: true,
  reason: null,
};

export type SectionsPageProps = {
  slug: string;
  content: LpContentV3;
  noticeText?: string;
  renderContext?: string;
  /** true no preview do editor: desabilita o form, a altura mínima e o CTA fixo. */
  preview?: boolean;
};

function isTopBar(s: LpSection): s is UrgencySection {
  return s.type === "urgency" && s.variant === "top_bar";
}

function renderSection(section: LpSection, content: LpContentV3, form: ReactNode): ReactNode {
  switch (section.type) {
    case "hero":
      return (
        <HeroImpacto section={section} storeName={content.store_name} logo={content.logo} formSlot={form} />
      );
    case "urgency":
      return isTopBar(section) ? null : <UrgencyBand section={section} />;
    case "deliverables":
      return <Deliverables section={section} />;
    case "audience":
      return <Audience section={section} />;
    case "proof":
      return <Proof section={section} />;
    case "gallery":
      return <Gallery section={section} />;
    case "about":
      return <About section={section} />;
    case "schedule":
      return <Schedule section={section} />;
    case "why_free":
      return <WhyFree section={section} />;
    case "after_signup":
      return <AfterSignup section={section} />;
    case "cta_band":
      return <CtaBand section={section} cta={content.cta} />;
    case "faq":
      return <Faq section={section} />;
  }
}

/**
 * Página de seções (v3). A ordem é a do `content.sections` (que já veio ordenada
 * pelo template); só as ligadas entram. A direção (`content.direction`) troca só
 * a pele: tokens, fonte display e como a paleta da marca é derivada (sobre o
 * escuro ou sobre o papel) — os renderers são os mesmos. A barra de urgência `top_bar` é a única
 * que sai do lugar: vai acima do hero, como no ONM ao Vivo. O formulário é um
 * só (#captura), dentro do hero; faixa e CTA fixo rolam até ele.
 */
export function SectionsPage({ slug, content, noticeText, renderContext, preview }: SectionsPageProps) {
  const editorial = content.direction === "editorial";
  const bg = directionBackground(content.direction);
  const palette =
    (editorial ? derivePalette(content.brand_color, { background: bg }) : deriveDarkPalette(content.brand_color, bg)) ??
    FALLBACK_PALETTE;
  const font = editorial ? displaySerif : display;
  const enabled = content.sections.filter((s) => s.enabled);
  const topBar = enabled.find(isTopBar);

  const form = (
    <div id="captura" className="scroll-mt-6">
      <LeadFormFields
        slug={slug}
        cta={content.cta}
        storeName={content.store_name}
        noticeText={noticeText}
        renderContext={renderContext}
        preview={preview}
      />
    </div>
  );

  return (
    <main
      style={directionStyle(content.direction, palette)}
      className={`${font.variable} bg-[var(--lp-bg)] text-[color:var(--lp-ink)] ${preview ? "" : "min-h-svh"}`}
    >
      {topBar ? <UrgencyTopBar section={topBar} /> : null}
      {enabled.map((s) => (
        <Fragment key={s.type}>{renderSection(s, content, form)}</Fragment>
      ))}
      <FooterV3 storeName={content.store_name} />
      {preview ? null : <StickyCta label={content.cta} />}
    </main>
  );
}
