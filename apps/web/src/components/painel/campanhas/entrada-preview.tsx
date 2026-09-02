"use client";

import { renderEntryPage } from "@/lib/campaigns/entry-page";

/**
 * Prévia da tela de entrada, ao lado do formulário.
 *
 * Usa a MESMA função que serve o /r/, com `preview: true` — sem script nenhum.
 * Um `<iframe srcDoc>` não herda a CSP desta página, então "sem nonce" não
 * seguraria os scripts: eles têm de não existir no HTML, ou o painel dispararia
 * um Lead falso no pixel do lojista toda vez que ele abrisse a aba.
 */
export function EntradaPreview({
  loja,
  campaignName,
  groupName = null,
}: {
  loja: string;
  campaignName: string;
  groupName?: string | null;
}) {
  const html = renderEntryPage({
    loja: loja || "Sua loja",
    campaignName: campaignName || "sua campanha",
    groupName,
    httpsUrl: "https://chat.whatsapp.com/EXEMPLO",
    deepLinkUrl: null,
    nonce: null,
    preview: true,
  });
  return (
    <div className="rounded-2xl border border-aco/10 bg-poco p-3">
      <p className="mb-2 font-data text-[11px] uppercase tracking-[0.08em] text-aco/55">Prévia da tela</p>
      <iframe
        title="Prévia da tela de entrada"
        srcDoc={html}
        sandbox=""
        className="h-[360px] w-full rounded-xl border-0 bg-white"
      />
      <p className="mt-2 text-xs text-aco/60">É o que a pessoa vê por um instante antes de o WhatsApp abrir.</p>
    </div>
  );
}
