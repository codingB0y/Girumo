import { HeroSection } from "@/components/pages/templates/sections/hero";
import { LeadFormSection } from "@/components/pages/templates/sections/lead-form";
import { VideoProofSection } from "@/components/pages/templates/sections/video-proof";
import { BenefitsGallerySection } from "@/components/pages/templates/sections/benefits-gallery";
import { FooterSection } from "@/components/pages/templates/sections/footer";
import { StickyCta } from "@/components/pages/templates/sections/sticky-cta";
import { brandStyle } from "@/components/pages/templates/tokens";
import type { StructureProps } from "@/components/pages/templates/contract";

/**
 * Estrutura A editorial ("Acesso VIP"): Hero+Form → Depoimento 9:16 → Benefícios+
 * Galeria → Rodapé mínimo. A paleta acessível da marca é aplicada como CSS vars
 * no wrapper (`brandStyle`), então as seções pegam a cor por `var(--lp-*)`. O CTA
 * fixo mobile só entra fora do preview (no editor não faz sentido).
 */
export function ConversionEditorial({ slug, content, palette, preview }: StructureProps) {
  return (
    <main style={brandStyle(palette)} className={preview ? "" : "min-h-svh"}>
      <HeroSection
        content={content}
        formSlot={<LeadFormSection slug={slug} content={content} preview={preview} />}
      />
      {content.proof ? <VideoProofSection proof={content.proof} /> : null}
      <BenefitsGallerySection benefits={content.benefits} gallery={content.gallery} />
      <FooterSection storeName={content.store_name} />
      {preview ? null : <StickyCta label={content.cta} />}
    </main>
  );
}
