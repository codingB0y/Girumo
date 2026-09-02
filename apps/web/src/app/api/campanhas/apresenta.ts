/**
 * Forma pública das integrações. Existe para que o token só possa sair daqui de
 * um jeito: mascarado. Espalhar o `maskToken` pelos três pontos do route.ts que
 * montam a resposta é como um deles acabaria devolvendo o objeto cru num
 * refactor futuro.
 */
import { maskToken, type Integracoes } from "@/lib/campaigns/settings";

export type IntegracoesPublicas = {
  meta: {
    pixel_id: string;
    evento: string;
    test_code: string;
    capi_token_set: boolean;
    capi_token_last4: string;
  };
  ga4: { id: string };
  google_ads: { id: string; label: string };
};

export function apresentaIntegracoes(i: Integracoes): IntegracoesPublicas {
  return {
    meta: {
      pixel_id: i.meta.pixel_id,
      evento: i.meta.evento,
      test_code: i.meta.test_code,
      ...maskToken(i.meta.capi_token),
    },
    ga4: { id: i.ga4.id },
    google_ads: { id: i.google_ads.id, label: i.google_ads.label },
  };
}
