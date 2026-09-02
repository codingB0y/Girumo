/**
 * Estado do editor v3 e as operações sobre ele. O rascunho É um `LpContentV3`
 * (não um shape paralelo como no v2): a página nasce preenchida pelo template,
 * então nunca há "meio content" — o que muda é texto por cima, seção ligada ou
 * desligada e variante. Toda operação devolve um objeto NOVO (o autosave e o
 * preview comparam por referência).
 */

import type { LandingPage } from "./schema";
import type { LpContentV3 } from "./content-v3";
import type { LpSection, LpSectionType, SectionOf } from "./sections";
import { instantiateTemplate, type LpTemplateKey } from "./templates-v3";

export type EditorStateV3 = {
  content: LpContentV3;
  // --- fora do conteúdo (colunas da página) ---
  target_group_url: string;
  campaign_slug: string;
  meta_pixel_id: string;
  ga4_id: string;
};

export function newDraftV3(template: LpTemplateKey, now: Date = new Date()): EditorStateV3 {
  return {
    content: instantiateTemplate(template, now),
    target_group_url: "",
    campaign_slug: "",
    meta_pixel_id: "",
    ga4_id: "",
  };
}

export function stateFromPage(page: LandingPage, content: LpContentV3): EditorStateV3 {
  return {
    content,
    target_group_url: page.target_group_url ?? "",
    campaign_slug: page.campaign_slug ?? "",
    meta_pixel_id: page.meta_pixel_id ?? "",
    ga4_id: page.ga4_id ?? "",
  };
}

/** Troca `enabled`/`variant` e/ou parte do `data` de UMA seção, sem mutar. */
export function patchSection<T extends LpSectionType>(
  content: LpContentV3,
  type: T,
  patch: { enabled?: boolean; variant?: SectionOf<T>["variant"]; data?: Partial<SectionOf<T>["data"]> },
): LpContentV3 {
  return {
    ...content,
    sections: content.sections.map((s): LpSection => {
      if (s.type !== type) return s;
      return {
        ...s,
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.variant === undefined ? {} : { variant: patch.variant }),
        data: patch.data ? { ...s.data, ...patch.data } : s.data,
      } as LpSection;
    }),
  };
}

/** Corpo do POST/PATCH: content + colunas, com vazio virando null. */
export function toSavePayload(state: EditorStateV3): Record<string, unknown> {
  return {
    content: state.content,
    target_group_url: state.target_group_url.trim() || null,
    campaign_slug: state.campaign_slug.trim() || null,
    meta_pixel_id: state.meta_pixel_id.trim() || null,
    ga4_id: state.ga4_id.trim() || null,
  };
}

/**
 * Erros do servidor (`details`) chaveados pelo caminho do campo. O validador v3
 * abre a mensagem com `<tipo>.<campo>` (ex.: "faq.items[1].a excede…"), então a
 * chave é o primeiro token — a mesma regra do `errorField` do v2.
 */
export function fieldErrorsV3(details: string[] | undefined): Record<string, string> {
  return Object.fromEntries((details ?? []).map((d) => [d.trim().split(" ")[0].replace(/\.$/, ""), d]));
}
