import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type TrackedLink = {
  id: string;
  tenant_id: string;
  campaign_group_id: string | null;
  slug: string;
  target_url: string;
  clicks: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "tracked_links";

export async function listTrackedLinks(tenantId: string): Promise<TrackedLink[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
/**
 * Resolve um slug SEM tenant — de propósito: é o ponto de entrada público
 * (`/r/:slug`), onde ainda não existe sessão. É seguro porque
 * `tracked_links_slug_unique` torna o slug único GLOBALMENTE: no máximo uma
 * linha casa, e o `tenant_id` dela é que passa a filtrar todo o resto.
 */
export async function getTrackedLinkBySlug(slug: string): Promise<TrackedLink | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * +1 clique, atômico no banco (read-modify-write perderia clique simultâneo).
 * Falha de contador não pode derrubar o redirect — quem chama trata isso.
 */
export async function incrementTrackedLinkClicks(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("increment_tracked_link_clicks", { p_id: id });
  if (error) throw new Error(error.message);
}

/**
 * Registra o clique com data, em `link_click_events`.
 *
 * Complementa `incrementTrackedLinkClicks`, que segue sendo a fonte do total: o
 * contador responde "quantos ao todo", esta linha responde "quando". Sem ela não
 * dá pra dizer quantos cliques foram ontem, e derivar isso do acumulado seria
 * inventar dado.
 *
 * `campaign_group_id` é copiado do link no momento do clique de propósito — se a
 * campanha do link mudar depois, o clique continua pertencendo à que estava
 * valendo na hora.
 */
export async function recordTrackedLinkClick(link: {
  id: string;
  tenant_id: string;
  campaign_group_id: string | null;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("link_click_events").insert({
    tenant_id: link.tenant_id,
    tracked_link_id: link.id,
    campaign_group_id: link.campaign_group_id,
  });
  if (error) throw new Error(error.message);
}

export async function createTrackedLink(
  tenantId: string,
  input: {
    campaign_group_id?: string;
    slug: string;
    /** Vazio no link MESTRE de campanha: lá o destino é rotativo, vem do pool. */
    target_url: string;
    metadata?: Record<string, unknown>;
  },
): Promise<TrackedLink> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tenantId,
      campaign_group_id: input.campaign_group_id ?? null,
      slug: input.slug,
      target_url: input.target_url,
      clicks: 0,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
