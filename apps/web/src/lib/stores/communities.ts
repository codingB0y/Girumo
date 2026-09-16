import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { criarLinkMestreOuDesfazer, uniqueMasterSlug } from "@/lib/campaigns/master-link";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

/**
 * Comunidades são `campaign_groups` vistas por outra ótica — mesma tabela que
 * `stores/campaign-groups.ts`, sem tabela nova. `whatsapp_community_jid` é
 * NULL enquanto a coleção for só uma gaveta da Girumo (a Fase 0 da comunidade
 * nativa do WhatsApp terminou em 403 — ver
 * docs/superpowers/specs/2026-09-04-gestao-de-comunidade-design.md §6 — então
 * este store não chama a Evolution; fica só no banco).
 */
export type Comunidade = {
  id: string;
  nome: string;
  slug: string;
  groupIds: string[];
  autoGrow: boolean;
  whatsappCommunityJid: string | null;
};

const TABLE = "campaign_groups";
const ROW_FIELDS = "id, name, slug, group_ids, auto_grow, whatsapp_community_jid";

type ComunidadeRow = {
  id: string;
  name: string;
  slug: string;
  group_ids: string[] | null;
  auto_grow: boolean;
  whatsapp_community_jid: string | null;
};

function mapRow(row: ComunidadeRow): Comunidade {
  return {
    id: row.id,
    nome: row.name,
    slug: row.slug,
    groupIds: row.group_ids ?? [],
    autoGrow: row.auto_grow,
    whatsappCommunityJid: row.whatsapp_community_jid,
  };
}

/**
 * Valida o tenant e devolve a query base. O service-role bypassa RLS — este
 * `.eq("tenant_id", ...)` é a única proteção real contra vazamento
 * cross-tenant (ver "Isolamento multi-tenant" no CLAUDE.md do projeto).
 * Tenant vazio lança antes de qualquer query rodar sem filtro.
 */
export function montarQueryComunidades(tenantId: string): { tenantId: string } {
  if (!tenantId) throw new Error("tenantId é obrigatório para consultar comunidades");
  return { tenantId };
}

export async function listarComunidades(tenantId: string): Promise<Comunidade[]> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(ROW_FIELDS)
    .eq("tenant_id", tid)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ComunidadeRow[]).map(mapRow);
}

/**
 * Comunidade É campanha: nasce com o mesmo invariante de `POST /api/campanhas`
 * — slug livre GLOBALMENTE (é o `/r/<slug>` do link mestre) e a linha em
 * `tracked_links`. Sem isso a comunidade aparece em /painel/campanhas com link
 * morto, ou com o QR apontando pro link de outro tenant.
 *
 * Devolve `null` quando o link mestre não pôde ser criado (corrida de slug); a
 * linha de `campaign_groups` já foi desfeita nesse caso.
 *
 * `userId` é só pra atribuir o marco de ativação (`first_campaign_created`) a
 * quem criou — passar `null` quando não houver usuário logado no contexto.
 * Comunidade e campanha são a mesma tabela, então o marco dispara em qualquer
 * uma que nascer primeiro: sem isso, um tenant que só cria comunidades nunca
 * ativava no funil (POST /api/campanhas era o único caminho que disparava).
 */
export async function criarComunidade(
  tenantId: string,
  dados: { nome: string },
  userId: string | null = null,
): Promise<Comunidade | null> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const existentes = await listarComunidades(tid);
  const slug = await uniqueMasterSlug(dados.nome, new Set(existentes.map((c) => c.slug)), "comunidade");

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      tenant_id: tid,
      name: dados.nome,
      slug,
      group_ids: [],
      auto_grow: false,
      whatsapp_community_jid: null,
    })
    .select(ROW_FIELDS)
    .single();
  if (error) throw new Error(error.message);

  const comunidade = mapRow(data as ComunidadeRow);
  const temLink = await criarLinkMestreOuDesfazer(tid, { id: comunidade.id, slug: comunidade.slug, name: comunidade.nome });
  if (!temLink) return null;

  if (existentes.length === 0) {
    void trackFunnelEvent({ tenantId: tid, userId, event: "first_campaign_created", onlyFirst: true, metadata: { campaignId: comunidade.id, via: "comunidade" } });
  }

  return comunidade;
}

async function buscarIdPorSlug(tenantId: string, slug: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Comunidade "${slug}" não encontrada`);
  return data.id as string;
}

/**
 * Vincula/desvincula sem ler o array primeiro: `campaign_group_append_group_id`
 * e `campaign_group_remove_group_id` fazem o append/remove num UPDATE só,
 * atômico por linha no Postgres. Ler `group_ids`, alterar em JS e regravar o
 * array inteiro (o que este store fazia antes) perde escrita quando a tela e
 * o auto-grow do worker mexem na mesma coleção ao mesmo tempo — clássico lost
 * update. Requer a migração `20260916040000_campaign_group_ids_rpc.sql`
 * aplicada nos dois bancos.
 */
export async function vincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const id = await buscarIdPorSlug(tid, slug);
  const { error } = await getSupabaseAdmin().rpc("campaign_group_append_group_id", {
    p_tenant_id: tid,
    p_id: id,
    p_whatsapp_group_id: whatsappGroupId,
  });
  if (error) throw new Error(error.message);
}

export async function desvincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const id = await buscarIdPorSlug(tid, slug);
  const { error } = await getSupabaseAdmin().rpc("campaign_group_remove_group_id", {
    p_tenant_id: tid,
    p_id: id,
    p_whatsapp_group_id: whatsappGroupId,
  });
  if (error) throw new Error(error.message);
}
