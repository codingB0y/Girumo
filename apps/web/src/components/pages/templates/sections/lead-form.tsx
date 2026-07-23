import type { LpContentV2 } from "@/lib/pages/content";
import { LeadFormFields } from "@/components/pages/templates/sections/lead-form-fields";

/**
 * Seção de captura da estrutura editorial. Fica direto sobre o papel (sem cartão),
 * como no modelo — a moldura visual é o próprio hero. O id `captura` é o âncora do
 * CTA fixo (StickyCta) e do foco pós-scroll.
 */
export function LeadFormSection({
  slug,
  content,
  noticeText,
  renderContext,
  preview,
}: {
  slug: string;
  content: LpContentV2;
  noticeText?: string;
  renderContext?: string;
  preview?: boolean;
}) {
  return (
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
}
