/**
 * Estado do editor guiado (Girumo LP v2) e a conversão pro contrato gravado.
 *
 * Por que um shape próprio em vez de editar `LpContentV2` direto: o editor é um
 * RASCUNHO — a lojista pode estar no meio do preenchimento (sem hero ainda, com
 * a prova ligada mas vazia), e isso não é um content válido. Aqui os campos são
 * sempre preenchíveis; `editorValuesToContentV2` monta o melhor content possível
 * e quem decide se está válido é o servidor (`parseContentInput`), nunca o client.
 *
 * `LpVideoRef` guarda `{provider, id}`, mas a lojista só sabe colar a URL do
 * vídeo (§7.3: sem URL manual de mídia, sem iframe cru) — por isso o rascunho
 * carrega `video_url` e o parsing acontece na conversão, com `parseVideoUrl`.
 */

import type { LpBenefit, LpContentV2, LpMediaRef } from "./content";
import { parseVideoUrl, type LpVideoProvider } from "./video";

/** Prova social em rascunho: pode estar ligada e incompleta enquanto edita. */
export type ProofDraft = {
  enabled: boolean;
  kind: "video" | "photo";
  /** URL pública do YouTube/Vimeo colada pela lojista (vira {provider,id}). */
  video_url: string;
  poster: LpMediaRef | null;
  photo: LpMediaRef | null;
  name: string;
  store: string;
  city: string;
  quote: string;
};

export type EditorValuesV2 = {
  // --- conteúdo (vai pro JSONB `content`) ---
  store_name: string;
  logo: LpMediaRef | null;
  brand_color: string;
  badge: string;
  headline: string;
  description: string;
  cta: string;
  hero: LpMediaRef | null;
  benefits: LpBenefit[];
  gallery: LpMediaRef[];
  proof: ProofDraft;
  // --- fora do conteúdo (colunas da página) ---
  target_group_url: string;
  campaign_slug: string;
  meta_pixel_id: string;
  ga4_id: string;
};

const EMPTY_PROOF: ProofDraft = {
  enabled: false,
  kind: "video",
  video_url: "",
  poster: null,
  photo: null,
  name: "",
  store: "",
  city: "",
  quote: "",
};

/** Cor inicial = wine da direção editorial; a lojista troca pela cor da marca. */
export const DEFAULT_BRAND_COLOR = "#6d2436";
const DEFAULT_CTA = "Quero entrar no grupo";

export const EMPTY_EDITOR_VALUES_V2: EditorValuesV2 = {
  store_name: "",
  logo: null,
  brand_color: DEFAULT_BRAND_COLOR,
  badge: "",
  headline: "",
  description: "",
  cta: DEFAULT_CTA,
  hero: null,
  benefits: [],
  gallery: [],
  proof: EMPTY_PROOF,
  target_group_url: "",
  campaign_slug: "",
  meta_pixel_id: "",
  ga4_id: "",
};

/** URL "colável" de volta pro editor a partir do {provider,id} guardado. */
function watchUrl(provider: LpVideoProvider, id: string): string {
  return provider === "youtube" ? `https://www.youtube.com/watch?v=${id}` : `https://vimeo.com/${id}`;
}

/**
 * Prova só entra no content quando dá pra montar de verdade: vídeo com URL que o
 * `parseVideoUrl` reconhece, ou foto já enviada. Rascunho pela metade vira null —
 * uma prova quebrada na página é pior que nenhuma.
 */
function draftToProof(draft: ProofDraft): LpContentV2["proof"] {
  if (!draft.enabled) return null;
  const person = { name: draft.name, store: draft.store, city: draft.city, quote: draft.quote };

  if (draft.kind === "photo") {
    return draft.photo ? { kind: "photo", photo: draft.photo, ...person } : null;
  }

  const video = parseVideoUrl(draft.video_url);
  if (!video) return null;
  return {
    kind: "video",
    video: { ...video, ...(draft.poster ? { poster: draft.poster } : {}) },
    ...person,
  };
}

/** Rascunho → content v2 (melhor esforço). Quem valida é o servidor. */
export function editorValuesToContentV2(values: EditorValuesV2): LpContentV2 {
  const badge = values.badge.trim();
  return {
    schema_version: 2,
    store_name: values.store_name,
    logo: values.logo,
    brand_color: values.brand_color,
    ...(badge ? { badge } : {}),
    headline: values.headline,
    description: values.description,
    cta: values.cta,
    hero: values.hero ?? { alt: "" },
    benefits: values.benefits,
    gallery: values.gallery,
    proof: draftToProof(values.proof),
  };
}

/** Content v2 gravado → rascunho do editor (só a parte de conteúdo). */
export function contentV2ToEditorValues(
  content: LpContentV2,
): Omit<EditorValuesV2, "target_group_url" | "campaign_slug" | "meta_pixel_id" | "ga4_id"> {
  const proof = content.proof;
  return {
    store_name: content.store_name,
    logo: content.logo ?? null,
    brand_color: content.brand_color,
    badge: content.badge ?? "",
    headline: content.headline,
    description: content.description,
    cta: content.cta,
    hero: content.hero,
    benefits: content.benefits,
    gallery: content.gallery,
    proof: proof
      ? {
          enabled: true,
          kind: proof.kind,
          video_url: proof.kind === "video" ? watchUrl(proof.video.provider, proof.video.id) : "",
          poster: proof.kind === "video" ? (proof.video.poster ?? null) : null,
          photo: proof.kind === "photo" ? proof.photo : null,
          name: proof.name,
          store: proof.store,
          city: proof.city,
          quote: proof.quote,
        }
      : EMPTY_PROOF,
  };
}

/**
 * Campo culpado a partir da mensagem do validador ("headline excede 72
 * caracteres." → "headline"), pra pendurar o erro do servidor no input certo em
 * vez de jogar tudo num alerta no topo. O validador sempre abre a mensagem com o
 * caminho do campo.
 */
export function errorField(message: string): string {
  return message.trim().split(" ")[0].replace(/\.$/, "");
}
