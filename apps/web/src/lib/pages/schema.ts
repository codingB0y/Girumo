/**
 * Flow Pages — tipos e validação (sem dependência externa; repo não usa Zod).
 * Fonte da verdade dos shapes trocados entre painel, API e render público.
 */

// Girumo LP v2 — barrel do domínio novo (conteúdo, paleta, vídeo, telefone).
import type { LpContentV2, LpStructure, LpVisualDirection } from "./content";
import { toContentV2, validateContentV2 } from "./content";
import { isLpContentV2 } from "./render";
export * from "./content";
export * from "./palette";
export * from "./video";
export { normalizeWhatsappBR } from "./phone";

export const LP_COLORS = ["cobalt", "emerald", "amber"] as const;
export type LpColor = (typeof LP_COLORS)[number];

export function normalizeLpColor(value: unknown): LpColor {
  return LP_COLORS.includes(value as LpColor) ? (value as LpColor) : "cobalt";
}

export type LpStatus = "draft" | "published" | "paused";

/** Os 5-7 placeholders que o lojista preenche no editor (form fixo). */
export type LpContent = {
  store_name: string;
  photo_url: string;
  headline: string;
  description: string;
  /** Tema do grupo — entra no texto de consent LGPD. */
  group_topic: string;
  primary_color: LpColor;
};

export type LpTemplate = {
  id: string;
  slug: string;
  name: string;
  niche: string | null;
  component_key: string;
  default_copy: Record<string, string>;
  required_fields: string[];
  thumbnail_url: string | null;
  created_at: string;
};

export type LandingPage = {
  id: string;
  tenant_id: string;
  template_id: string;
  slug: string;
  status: LpStatus;
  content: LpContent | LpContentV2;
  /** Versão do shape em `content` — 2 = editorial v2, 1 = legado (Flow Pages). */
  content_schema_version: LpContentSchemaVersion;
  campaign_slug: string | null;
  target_group_url: string | null;
  meta_pixel_id: string | null;
  ga4_id: string | null;
  tiktok_pixel_id: string | null;
  /** Dimensões do modelo — gravadas na captura pra saber O QUE a pessoa viu. */
  structure: LpStructure;
  visual_direction: LpVisualDirection;
  model_version: number;
  /** Versão do aviso apresentado (§8); muda quando a redação muda. */
  notice_version: string;
  /** Sobe a cada publish: separa capturas de versões diferentes da página. */
  published_version: number;
  published_at: string | null;
  views_count: number;
  leads_count: number;
  created_at: string;
  updated_at: string;
};

export function normalizeLandingPage<T extends LandingPage>(page: T): T {
  if (isLpContentV2(page.content)) return page;

  return {
    ...page,
    content: {
      ...page.content,
      primary_color: normalizeLpColor(page.content.primary_color),
    },
  };
}

/** Página pública: LandingPage + component_key e copy fixa do template (join). */
export type PublicLandingPage = LandingPage & {
  component_key: string;
  template_copy: Record<string, string>;
};

export type LpCreateInput = {
  template_id: string;
  content: LpContent | LpContentV2;
  content_schema_version: LpContentSchemaVersion;
  campaign_slug?: string | null;
  target_group_url?: string | null;
  meta_pixel_id?: string | null;
  ga4_id?: string | null;
};

const MAX = {
  store_name: 60,
  headline: 90,
  description: 240,
  group_topic: 60,
  photo_url: 500,
} as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Valida o content vindo do editor. Retorna lista de erros legíveis (vazia = ok). */
export function validateContent(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) {
    return ["content inválido."];
  }
  const c = input as Record<string, unknown>;

  for (const field of ["store_name", "headline", "description", "group_topic"] as const) {
    if (!isNonEmptyString(c[field])) {
      errors.push(`${field} é obrigatório.`);
    } else if ((c[field] as string).length > MAX[field]) {
      errors.push(`${field} excede ${MAX[field]} caracteres.`);
    }
  }

  if (!isNonEmptyString(c.photo_url)) {
    errors.push("photo_url é obrigatório.");
  } else if (!/^https:\/\/\S+$/i.test(c.photo_url as string)) {
    errors.push("photo_url precisa começar com https:// (sem espaços).");
  } else if ((c.photo_url as string).length > MAX.photo_url) {
    errors.push(`photo_url excede ${MAX.photo_url} caracteres.`);
  }

  if (!LP_COLORS.includes(c.primary_color as LpColor)) {
    errors.push(`primary_color precisa ser uma de: ${LP_COLORS.join(", ")}.`);
  }

  return errors;
}

/** Sanitiza pro shape exato (descarta chaves extras — nada além dos placeholders). */
export function toContent(input: Record<string, unknown>): LpContent {
  return {
    store_name: String(input.store_name).trim(),
    photo_url: String(input.photo_url).trim(),
    headline: String(input.headline).trim(),
    description: String(input.description).trim(),
    group_topic: String(input.group_topic).trim(),
    primary_color: normalizeLpColor(input.primary_color),
  };
}

/* ------------------- entrada do editor: legado × v2 ------------------- */

/** Versão do shape do content — espelha a coluna `content_schema_version`. */
export type LpContentSchemaVersion = 1 | 2;

export type ContentParseResult =
  | { ok: false; errors: string[] }
  | { ok: true; schema_version: 1; content: LpContent }
  | { ok: true; schema_version: 2; content: LpContentV2 };

/**
 * Porta de entrada única do `content` vindo do client (POST/PATCH de páginas).
 * O eixo é o `schema_version` declarado — o mesmo do render (`isLpContentV2`):
 * quem declara 2 é validado como v2 e recebe erros de v2; conteúdo sem versão é
 * legado, então o editor antigo segue funcionando durante o dual (a Fase 5
 * migra). Valida e sanitiza junto, para nenhuma rota gravar sem passar pelos dois.
 */
export function parseContentInput(input: unknown): ContentParseResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["content inválido."] };
  }

  if (isLpContentV2(input)) {
    const errors = validateContentV2(input);
    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      schema_version: 2,
      content: toContentV2(input as unknown as Record<string, unknown>),
    };
  }

  const errors = validateContent(input);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, schema_version: 1, content: toContent(input as Record<string, unknown>) };
}

/** Texto de consent LGPD renderizado na LP e snapshotado no lead. */
export function consentText(storeName: string, groupTopic: string): string {
  return `Aceito ser adicionado ao grupo de WhatsApp de ${storeName} e receber mensagens sobre ${groupTopic}. Posso sair do grupo e revogar este consentimento a qualquer momento.`;
}

/**
 * Aviso v2: sem checkbox, o clique no CTA é a ação afirmativa (§8.2), e o v2 não
 * tem `group_topic` — o aviso cita a loja e o que o grupo manda.
 * Redação final pendente do gate jurídico (§8/§13).
 */
export function noticeTextV2(storeName: string): string {
  return `Ao continuar, você solicita acesso ao grupo e poderá receber novidades e ofertas da ${storeName}.`;
}

/**
 * Fonte única do aviso: o que a página MOSTRA e o que a captura SNAPSHOTA como
 * prova têm que ser a mesma string — se divergirem, o snapshot deixa de valer
 * como evidência do que a pessoa leu. Por isso o form e a rota de lead chamam
 * daqui, e não montam o texto por conta.
 */
export function noticeTextFor(content: LpContent | LpContentV2): string {
  return isLpContentV2(content)
    ? noticeTextV2(content.store_name)
    : consentText(content.store_name, content.group_topic);
}

/** Destino do lead: campanha rastreada (rotação) > URL fixa de grupo. */
export function resolveTargetUrl(page: Pick<LandingPage, "campaign_slug" | "target_group_url">): string | null {
  if (page.campaign_slug) return `/r/${page.campaign_slug}`;
  return page.target_group_url;
}

/** Valida URL de grupo/destino fixo (quando não há campanha). */
export function validateTargetGroupUrl(url: string): boolean {
  return /^https:\/\/(chat\.whatsapp\.com|wa\.me)\/\S+$/i.test(url.trim());
}

/* --------------------------- v2: contato × captura --------------------------- */

/** Contato único por tenant+whatsapp (dedup global de pessoa). */
export type LpContact = {
  id: string;
  tenant_id: string;
  name: string | null;
  whatsapp: string;
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Captura: envio numa página/versão/campanha, referencia o contato + evidência do aviso. */
export type LpCapture = {
  id: string;
  tenant_id: string;
  landing_page_id: string;
  contact_id: string;
  published_version: number;
  campaign_slug: string | null;
  structure: LpStructure;
  visual_direction: LpVisualDirection;
  model_version: number;
  notice_version: string;
  notice_text: string;
  device: string | null;
  utm: Record<string, string | null>;
  idem_key: string;
  group_clicked_at: string | null;
  created_at: string;
};
