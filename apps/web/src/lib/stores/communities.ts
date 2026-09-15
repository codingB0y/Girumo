import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { criarLinkMestreOuDesfazer, uniqueMasterSlug } from "@/lib/campaigns/master-link";

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
 */
export async function criarComunidade(tenantId: string, dados: { nome: string }): Promise<Comunidade | null> {
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
  return temLink ? comunidade : null;
}

async function buscarPorSlug(tenantId: string, slug: string): Promise<{ id: string; groupIds: string[] }> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, group_ids")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Comunidade "${slug}" não encontrada`);
  return { id: data.id as string, groupIds: (data.group_ids as string[] | null) ?? [] };
}

async function salvarGroupIds(tenantId: string, id: string, groupIds: string[]): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ group_ids: groupIds })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function vincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const { id, groupIds } = await buscarPorSlug(tid, slug);
  const atualizado = groupIds.includes(whatsappGroupId) ? [...groupIds] : [...groupIds, whatsappGroupId];
  await salvarGroupIds(tid, id, atualizado);
}

export async function desvincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);
  const { id, groupIds } = await buscarPorSlug(tid, slug);
  await salvarGroupIds(tid, id, groupIds.filter((g) => g !== whatsappGroupId));
}
