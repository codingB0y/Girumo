import { LeadForm } from "@/components/pages/lead-form";
import type { LpContentV2 } from "@/lib/pages/content";
import { TYPE } from "@/components/pages/templates/tokens";

/**
 * Aviso de privacidade v2 (provisório). A redação final e a remoção do checkbox
 * são da Fase 4, e a base legal depende do gate jurídico (§8/§13). Aqui só
 * geramos um texto com o nome da loja para o form client atual exibir.
 */
function noticeText(storeName: string): string {
  return `Ao continuar, você autoriza ${storeName} a enviar ofertas pelo WhatsApp e a te adicionar ao grupo. Você pode sair quando quiser.`;
}

/**
 * Seção de captura: moldura editorial em volta do form client existente
 * (components/pages/lead-form.tsx) — NÃO reimplementa o comportamento. O botão
 * usa a cor da marca via CSS var (`!text` vence o text-white padrão do form). O
 * destino do grupo NUNCA sai daqui: vem só do redirect_url do POST /api/p/lead.
 * O id `captura` é o âncora do CTA fixo (StickyCta) e do foco pós-scroll.
 */
export function LeadFormSection({
  slug,
  content,
  preview,
}: {
  slug: string;
  content: LpContentV2;
  preview?: boolean;
}) {
  return (
    <div
      id="captura"
      className="scroll-mt-6 rounded-2xl border border-[#e4dcd0] bg-white p-5 shadow-sm lg:p-6"
    >
      <p className={`${TYPE.meta} text-[color:var(--lp-accent)]`}>Entre no grupo VIP</p>
      <p className="mt-1 text-sm text-[#6b6259]">
        Nome e WhatsApp — a gente te manda o convite na hora.
      </p>
      <LeadForm
        slug={slug}
        cta={content.cta}
        consentText={noticeText(content.store_name)}
        buttonClass="bg-[var(--lp-brand)] !text-[color:var(--lp-on-brand)] focus-visible:outline-[color:var(--lp-brand)]"
        preview={preview}
      />
    </div>
  );
}
