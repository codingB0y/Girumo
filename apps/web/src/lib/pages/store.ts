import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateSlug } from "@/lib/pages/slug";
import { legacyAliasFor, type LpCanonicalEvent } from "@/lib/pages/capture";
import type {
  LandingPage,
  LpCreateInput,
  LpStatus,
  LpTemplate,
  PublicLandingPage,
} from "@/lib/pages/schema";

const PAGES = "landing_pages";
const TEMPLATES = "landing_page_templates";

/* ----------------------------- templates ----------------------------- */

export async function listLpTemplates(): Promise<LpTemplate[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TEMPLATES)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LpTemplate[];
}

export async function getLpTemplateById(id: string): Promise<LpTemplate | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TEMPLATES)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LpTemplate | null;
}

/* --------------------------- landing pages --------------------------- */

export async function listLandingPages(tenantId: string): Promise<LandingPage[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGES)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LandingPage[];
}

export async function getLandingPageById(
  tenantId: string,
  id: string,
): Promise<LandingPage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGES)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LandingPage | null;
}

/** Render público: só páginas published, com component_key do template no join. */
export async function getPublishedPageBySlug(slug: string): Promise<PublicLandingPage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGES)
    .select("*, landing_page_templates(component_key, default_copy)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { landing_page_templates: tpl, ...page } = data as LandingPage & {
    landing_page_templates: {
      component_key: string;
      default_copy: Record<string, string>;
    } | null;
  };
  return {
    ...page,
    component_key: tpl?.component_key ?? "basic",
    template_copy: tpl?.default_copy ?? {},
  };
}

const UNIQUE_VIOLATION = "23505";

export async function createLandingPage(
  tenantId: string,
  input: LpCreateInput,
): Promise<LandingPage> {
  const supabase = getSupabaseAdmin();

  // Colisão de sufixo aleatório é rara — 3 tentativas resolvem.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateSlug(input.content.store_name);
    const { data, error } = await supabase
      .from(PAGES)
      .insert({
        tenant_id: tenantId,
        template_id: input.template_id,
        slug,
        status: "draft",
        content: input.content,
        content_schema_version: input.content_schema_version,
        campaign_slug: input.campaign_slug ?? null,
        target_group_url: input.target_group_url ?? null,
        meta_pixel_id: input.meta_pixel_id ?? null,
        ga4_id: input.ga4_id ?? null,
      })
      .select("*")
      .single();

    if (!error) return data as LandingPage;
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
  }
  throw new Error("Não foi possível gerar um slug único. Tente de novo.");
}

export type LpUpdatePatch = Partial<{
  content: LpCreateInput["content"];
  content_schema_version: LpCreateInput["content_schema_version"];
  published_version: number;
  campaign_slug: string | null;
  target_group_url: string | null;
  meta_pixel_id: string | null;
  ga4_id: string | null;
  status: LpStatus;
  published_at: string;
}>;

export async function updateLandingPage(
  tenantId: string,
  id: string,
  patch: LpUpdatePatch,
): Promise<LandingPage | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGES)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LandingPage | null;
}

/* --------------------------- leads + eventos -------------------------- */

const LEADS = "lp_leads";
const EVENTS = "lp_tracking_events";

export type LpEventName =
  // canônicos (funil de 5) + legado (compat de leitura)
  | "page_view"
  | "form_start"
  | "lead_submit_attempt"
  | "lead_created"
  | "group_click"
  | "PageView"
  | "Lead"
  | "GroupJoin";

export type LpLeadRow = {
  id: string;
  name: string | null;
  whatsapp: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  referrer: string | null;
  status: string;
  consent_at: string;
  created_at: string;
};

export type LpAttribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  referrer: string | null;
};

/**
 * Grava um evento do funil. Com `idemKey`, o índice
 * uq_lp_events_idem(landing_page_id, event_name, idem_key) torna a escrita
 * idempotente: o mesmo evento da mesma visita não conta duas vezes por causa de
 * um efeito que roda em dobro, um beacon reenviado ou um F5 (§5).
 * Sem `idemKey` o comportamento é o de antes (grava sempre) — é o que o legado usa.
 */
export async function insertLpTrackingEvent(input: {
  tenantId: string;
  landingPageId: string;
  eventName: LpEventName;
  eventData: Record<string, unknown>;
  idemKey?: string | null;
  dimensions?: {
    publishedVersion: number;
    structure: string;
    visualDirection: string;
    modelVersion: number;
    device: string | null;
  };
}): Promise<{ created: boolean }> {
  const { error } = await getSupabaseAdmin()
    .from(EVENTS)
    .insert({
      tenant_id: input.tenantId,
      landing_page_id: input.landingPageId,
      event_name: input.eventName,
      event_data: input.eventData,
      idem_key: input.idemKey ?? null,
      ...(input.dimensions
        ? {
            published_version: input.dimensions.publishedVersion,
            structure: input.dimensions.structure,
            visual_direction: input.dimensions.visualDirection,
            model_version: input.dimensions.modelVersion,
            device: input.dimensions.device,
          }
        : {}),
    });

  if (!error) return { created: true };
  // Evento repetido da mesma visita: sucesso silencioso, sem inflar a métrica.
  if (error.code === UNIQUE_VIOLATION) return { created: false };
  throw new Error(error.message);
}

/** Contador-cache (views/leads) — falha silenciosa de propósito (é cache). */
export async function bumpLpCounter(lpId: string, field: "views" | "leads"): Promise<void> {
  await getSupabaseAdmin().rpc("increment_lp_counter", { p_lp_id: lpId, p_field: field });
}

export async function insertLpLead(input: {
  tenantId: string;
  landingPageId: string;
  name: string;
  whatsapp: string;
  attribution: LpAttribution;
  userAgent: string | null;
  ipHash: string | null;
  consentText: string;
}): Promise<{ created: boolean }> {
  const { error } = await getSupabaseAdmin().from(LEADS).insert({
    tenant_id: input.tenantId,
    landing_page_id: input.landingPageId,
    name: input.name,
    whatsapp: input.whatsapp,
    ...input.attribution,
    user_agent: input.userAgent,
    ip_hash: input.ipHash,
    consent_at: new Date().toISOString(),
    consent_text: input.consentText,
  });

  if (!error) return { created: true };
  // Dedup: mesmo WhatsApp na mesma LP → sucesso idempotente (preserva 1º consent)
  if (error.code === UNIQUE_VIOLATION) return { created: false };
  throw new Error(error.message);
}

export type LpMetrics = { views: number; leads: number; conversion: number };

/**
 * Fonte da verdade das métricas = lp_tracking_events (decisão da Sessão 0).
 * Conta o nome canônico E o legado juntos: as páginas do v1 gravaram
 * PageView/Lead e continuam contando enquanto não migram (§5/§6).
 */
export async function getLpMetrics(tenantId: string, landingPageId: string): Promise<LpMetrics> {
  const supabase = getSupabaseAdmin();
  const countFor = async (event: LpCanonicalEvent): Promise<number> => {
    const names = [event, legacyAliasFor(event)].filter(Boolean) as string[];
    const { count, error } = await supabase
      .from(EVENTS)
      .select("id", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("landing_page_id", landingPageId)
      .in("event_name", names)
      .limit(1);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [views, leads] = await Promise.all([countFor("page_view"), countFor("lead_created")]);
  return {
    views,
    leads,
    conversion: views > 0 ? Math.round((leads / views) * 1000) / 10 : 0,
  };
}

export async function listRecentLpLeads(
  tenantId: string,
  landingPageId: string,
  limit = 20,
): Promise<LpLeadRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(LEADS)
    .select(
      "id, name, whatsapp, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, referrer, status, consent_at, created_at",
    )
    .eq("tenant_id", tenantId)
    .eq("landing_page_id", landingPageId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LpLeadRow[];
}

/* --------------------- contatos + capturas (v2) ---------------------- */

const CONTACTS = "lp_contacts";
const CAPTURES = "lp_captures";

export type LpContactRow = {
  id: string;
  tenant_id: string;
  name: string | null;
  whatsapp: string;
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Upsert de contato por (tenant, whatsapp) — dedup global de pessoa.
 * `name` só é gravado quando vem não-vazio (não sobrescreve um nome bom com null).
 * Retorna o contato (novo ou existente).
 */
export async function upsertLpContact(input: {
  tenantId: string;
  whatsapp: string; // já normalizado E.164 BR no server
  name: string | null;
}): Promise<LpContactRow> {
  const payload: Record<string, unknown> = {
    tenant_id: input.tenantId,
    whatsapp: input.whatsapp,
    updated_at: new Date().toISOString(),
  };
  const name = input.name?.trim();
  if (name) payload.name = name;

  const { data, error } = await getSupabaseAdmin()
    .from(CONTACTS)
    .upsert(payload, { onConflict: "tenant_id,whatsapp" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as LpContactRow;
}

export type LpCaptureInput = {
  tenantId: string;
  landingPageId: string;
  contactId: string;
  publishedVersion: number;
  campaignSlug: string | null;
  structure: string;
  visualDirection: string;
  modelVersion: number;
  noticeVersion: string;
  noticeText: string;
  device: string | null;
  attribution: LpAttribution;
  idemKey: string;
};

/**
 * Insere a captura (evidência do aviso + atribuição). Idempotente por
 * (landing_page_id, published_version, contact_id, idem_key): reenvio ou
 * recarregamento do mesmo envio não cria duplicata.
 */
export async function insertLpCapture(input: LpCaptureInput): Promise<{ created: boolean }> {
  const { error } = await getSupabaseAdmin().from(CAPTURES).insert({
    tenant_id: input.tenantId,
    landing_page_id: input.landingPageId,
    contact_id: input.contactId,
    published_version: input.publishedVersion,
    campaign_slug: input.campaignSlug,
    structure: input.structure,
    visual_direction: input.visualDirection,
    model_version: input.modelVersion,
    notice_version: input.noticeVersion,
    notice_text: input.noticeText,
    device: input.device,
    ...input.attribution,
    idem_key: input.idemKey,
  });
  if (!error) return { created: true };
  if (error.code === UNIQUE_VIOLATION) return { created: false };
  throw new Error(error.message);
}

/* ------------------------------ health ------------------------------- */

export async function flowPagesHealth(): Promise<{ db: "up" | "down"; templates_count: number }> {
  try {
    // Sem head:true de propósito: HEAD no PostgREST não reporta erro de
    // tabela inexistente (mascarou um schema ausente na sessão 1).
    const { count, error } = await getSupabaseAdmin()
      .from(TEMPLATES)
      .select("id", { count: "exact" })
      .limit(1);
    if (error) return { db: "down", templates_count: 0 };
    return { db: "up", templates_count: count ?? 0 };
  } catch {
    return { db: "down", templates_count: 0 };
  }
}
