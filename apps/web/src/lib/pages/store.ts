import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateSlug } from "@/lib/pages/slug";
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

export type LpEventName = "PageView" | "Lead" | "GroupJoin";

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

export async function insertLpTrackingEvent(input: {
  tenantId: string;
  landingPageId: string;
  eventName: LpEventName;
  eventData: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from(EVENTS).insert({
    tenant_id: input.tenantId,
    landing_page_id: input.landingPageId,
    event_name: input.eventName,
    event_data: input.eventData,
  });
  if (error) throw new Error(error.message);
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

/** Fonte da verdade das métricas = lp_tracking_events (decisão da Sessão 0). */
export async function getLpMetrics(tenantId: string, landingPageId: string): Promise<LpMetrics> {
  const supabase = getSupabaseAdmin();
  const countFor = async (eventName: LpEventName): Promise<number> => {
    const { count, error } = await supabase
      .from(EVENTS)
      .select("id", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("landing_page_id", landingPageId)
      .eq("event_name", eventName)
      .limit(1);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [views, leads] = await Promise.all([countFor("PageView"), countFor("Lead")]);
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
