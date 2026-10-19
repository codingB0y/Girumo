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

/** Link da loja pelo id — sempre com o tenant (a integração do site guarda o id). */
export async function getTrackedLinkById(tenantId: string, id: string): Promise<TrackedLink | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data as TrackedLink[] | null)?.[0] ?? null;
}

/** Slugs por pedido: o filtro `in.(…)` vai na URL, e 100 slugs dão uns 5 KB. */
const SLUGS_POR_PEDIDO = 100;

/**
 * Os links desta loja com esses slugs. `slug` é único no banco inteiro, então volta no máximo
 * uma linha por slug — longe do corte calado de 1000 linhas que `listTrackedLinks` sofre numa
 * loja grande. Sem slug, sem consulta.
 */
export async function listTrackedLinksBySlugs(
  tenantId: string,
  slugs: readonly string[],
): Promise<Pick<TrackedLink, "slug" | "campaign_group_id">[]> {
  const unicos = [...new Set(slugs)];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += SLUGS_POR_PEDIDO) lotes.push(unicos.slice(i, i + SLUGS_POR_PEDIDO));
  const respostas = await Promise.all(
    lotes.map((lote) =>
      getSupabaseAdmin().from(TABLE).select("slug, campaign_group_id").eq("tenant_id", tenantId).in("slug", lote),
    ),
  );
  return respostas.flatMap(({ data, error }) => {
    if (error) throw new Error(error.message);
    return (data ?? []) as Pick<TrackedLink, "slug" | "campaign_group_id">[];
  });
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
export async function recordTrackedLinkClick(
  link: {
    id: string;
    tenant_id: string;
    campaign_group_id: string | null;
  },
  // Funil de anúncios: o cadastro que trouxe o clique (?cid=, já conferido) e o
  // grupo que o rotador escolheu. Opcional para as chamadas que não sabem disso.
  extra: { captureId: string | null; whatsappGroupId: string | null } = { captureId: null, whatsappGroupId: null },
): Promise<void> {
  const { error } = await getSupabaseAdmin().from("link_click_events").insert({
    tenant_id: link.tenant_id,
    tracked_link_id: link.id,
    campaign_group_id: link.campaign_group_id,
    capture_id: extra.captureId,
    whatsapp_group_id: extra.whatsappGroupId,
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

/**
 * Regrava o `metadata` de um link do tenant, por id. Serve pra trocar quem é o
 * link mestre e quem é apelido sem mexer em slug — slug liberado, mesmo por um
 * instante, pode ser tomado por outra conta.
 */
export async function setTrackedLinkMetadata(
  tenantId: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Remove o link de um slug do tenant. Usado quando a entidade dona do link
 * some (ex.: uma indicação apagada) — sem isso o `/r/:slug` continuaria
 * redirecionando para sempre um link que o painel já não mostra.
 *
 * Devolve `false` quando nada casou: slug de outro tenant não apaga nada.
 */
export async function deleteTrackedLinkBySlug(tenantId: string, slug: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
