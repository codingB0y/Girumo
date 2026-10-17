import "server-only";

import { lerBuscaDeContato } from "@/lib/painel/busca-de-contato";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Leads capturados na entrada em grupos.
 *
 * Substitui o ndjson de `lib/leads-store.ts`, que só funcionava porque a engine
 * Baileys e o app dividiam disco. O worker da F3 roda em outro container.
 */

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  tenant_id: string;
  /** NULL quando o participante veio como `@lid` sem telefone. Nunca inventado. */
  phone: string | null;
  name: string | null;
  source_group_id: string | null;
  source_group_name: string | null;
  source_campaign: string | null;
  status: LeadStatus;
  /** Primeira entrada, imutável. */
  entered_at: string;
  last_seen_at: string | null;
  /** Outros grupos em que o mesmo número entrou. */
  also_in: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "leads";

type RespostaDoHead = { count: number | null; error: { message: string } | null; status: number };

/**
 * A contagem de uma consulta HEAD. HEAD não tem corpo: o erro chega sem
 * mensagem, um 404 vazio volta como 204 sem contagem, e um `Content-Range`
 * com `*` no lugar do total vira NaN. Tudo isso é erro, nunca um número que
 * ninguém mediu.
 */
function contagemDoHead({ count, error, status }: RespostaDoHead): number {
  if (error) throw new Error(error.message || `HTTP ${status}`);
  if (count === null || !Number.isInteger(count)) throw new Error(`HTTP ${status} sem contagem`);
  return count;
}

/**
 * Leads do tenant, ou só os de um status (head+count, sem puxar as linhas).
 * Contar a lista de `listLeads` parava nas 1000 linhas que o PostgREST devolve
 * sem erro.
 */
export async function countLeads(tenantId: string, status?: LeadStatus): Promise<number> {
  let query = getSupabaseAdmin()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (status) query = query.eq("status", status);
  return contagemDoHead(await query);
}

/**
 * Entradas nos grupos desde `since` (head+count, sem puxar as linhas): a regra de
 * `campaign_activity`, grupo de origem no pool e `entered_at >= since`.
 */
export async function countEntriesSince(tenantId: string, groupIds: string[], since: string): Promise<number> {
  if (groupIds.length === 0) return 0;
  // ponytail: os JIDs vão na URL; passando de ~230 grupos ela cruza os 8 mil
  // caracteres em que o postgrest-js já avisa do limite do servidor. Aí, fatiar
  // em lotes e somar (cada lead tem um grupo de origem só).
  return contagemDoHead(
    await getSupabaseAdmin()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("source_group_id", groupIds)
      .gte("entered_at", since),
  );
}

/** Entradas na loja com `entered_at` em [de, ate), contadas no banco (head+count). */
export async function countEntriesBetween(tenantId: string, de: string, ate: string): Promise<number> {
  return contagemDoHead(
    await getSupabaseAdmin()
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("entered_at", de)
      .lt("entered_at", ate),
  );
}

/** Linhas por página. O PostgREST corta em 1000 sem avisar; a página nunca pede mais que isso. */
const LINHAS_POR_PAGINA = 1000;

/**
 * Entradas na loja com `entered_at` em [de, ate) e quantas vieram de cada grupo.
 * Paginado: o relatório semanal lia uma consulta só e dizia "1000 novos
 * contatos" para semana de 1498. Agrupar no banco pede agregação no PostgREST,
 * que não está ligada; o que desce é só o nome do grupo.
 */
export async function entradasEntre(
  tenantId: string,
  de: string,
  ate: string,
): Promise<{ total: number; porGrupo: Map<string, number> }> {
  const porGrupo = new Map<string, number>();
  let total = 0;
  // Para na página vazia, não na incompleta: se o teto do servidor baixar,
  // uma página curta não pode passar por "acabou".
  for (;;) {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .select("source_group_name")
      .eq("tenant_id", tenantId)
      .gte("entered_at", de)
      .lt("entered_at", ate)
      .order("id")
      .range(total, total + LINHAS_POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return { total, porGrupo };
    total += data.length;
    for (const { source_group_name: nome } of data) {
      if (nome) porGrupo.set(nome, (porGrupo.get(nome) ?? 0) + 1);
    }
  }
}

/**
 * As `limit` entradas mais recentes nos grupos, filtradas aqui e não no
 * navegador: campanha quieta numa loja grande não aparecia entre as 1000 leads
 * mais novas da loja. Sem telefone, que a lista não mostra.
 */
export async function listLatestEntries(
  tenantId: string,
  groupIds: string[],
  limit: number,
): Promise<Pick<Lead, "id" | "name" | "source_group_name" | "entered_at">[]> {
  if (groupIds.length === 0) return [];
  // ponytail: o índice que serve é (tenant_id, entered_at desc); campanha com
  // menos de `limit` entradas percorre o histórico da loja inteira. Se a rota
  // pesar, (tenant_id, source_group_id, entered_at desc) nos dois bancos.
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, name, source_group_name, entered_at")
    .eq("tenant_id", tenantId)
    .in("source_group_id", groupIds)
    .order("entered_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Lead, "id" | "name" | "source_group_name" | "entered_at">[];
}

/** Origem de um lead (pra atribuir a campanha ao pedido). null se não achar. */
export async function getLeadAttribution(
  tenantId: string,
  leadId: string,
): Promise<Pick<Lead, "source_campaign" | "source_group_id"> | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("source_campaign, source_group_id")
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Mais recentes primeiro. `limit` é pro ticker do letreiro, que só quer o último. */
export async function listLeads(tenantId: string, limit?: number): Promise<Lead[]> {
  let query = getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("entered_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export type PaginaDeLeads = { q?: string; status?: LeadStatus; offset: number; limit: number };

/** `%`, `_` e `\` digitados são texto, não curinga do LIKE. */
function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Uma página da tela de Contatos, filtrada e buscada no banco. A tela filtrava
 * no navegador a lista de `listLeads`, que para nas 1000 mais recentes: em loja
 * grande o cliente antigo não aparecia em busca nenhuma.
 */
export async function listLeadsPage(
  tenantId: string,
  { q = "", status, offset, limit }: PaginaDeLeads,
): Promise<Lead[]> {
  let query = getSupabaseAdmin().from(TABLE).select("*").eq("tenant_id", tenantId);
  if (status) query = query.eq("status", status);
  const busca = lerBuscaDeContato(q);
  if (busca && "nome" in busca) query = query.ilike("name", `%${escaparLike(busca.nome)}%`);
  if (busca && "digitos" in busca) query = query.like("phone", `%${busca.digitos}%`);
  // ponytail: offset desloca quando entra lead novo entre uma página e outra (a
  // tela tira o repetido pelo id). Keyset por (entered_at, id) se incomodar.
  const { data, error } = await query
    .order("entered_at", { ascending: false })
    .order("id")
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

/** Ids por `in.(…)`: a URL do PostgREST não aguenta centenas de uuids, e o lote fica longe das 1000 linhas. */
const IDS_POR_CONSULTA = 100;

/**
 * Leads do tenant por id, mais recentes primeiro. Em lotes: "entraram e ainda
 * não compraram" de um anúncio passa fácil de 100 pessoas, e `listLeads` para
 * nas 1000 mais recentes — quem já era do grupo ficaria de fora.
 */
export async function listLeadsByIds(tenantId: string, ids: readonly string[]): Promise<Lead[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) lotes.push(ids.slice(i, i + IDS_POR_CONSULTA));
  const respostas = await Promise.all(
    lotes.map((lote) => getSupabaseAdmin().from(TABLE).select("*").eq("tenant_id", tenantId).in("id", lote)),
  );
  const leads: Lead[] = [];
  for (const { data, error } of respostas) {
    if (error) throw new Error(error.message);
    leads.push(...((data ?? []) as Lead[]));
  }
  return leads.sort((a, b) => (a.entered_at < b.entered_at ? 1 : a.entered_at > b.entered_at ? -1 : 0));
}

export type AddLeadInput = {
  phone: string;
  name?: string;
  /** Ausente quando o lead nasce de uma venda (`/api/vendas`), não da entrada num grupo. */
  sourceGroup?: string;
  sourceGroupId?: string;
  sourceCampaign?: string;
};

/**
 * Cria ou reencontra o lead pelo telefone.
 *
 * Passa pelo RPC `upsert_lead` em vez de fazer select-depois-insert: o dedupe
 * precisa ser atômico, senão duas entradas simultâneas do mesmo número viram
 * dois leads. `entered_at` fica imutável; reentrada atualiza `last_seen_at` e
 * acumula a origem nova em `also_in`.
 */
export async function addLead(tenantId: string, input: AddLeadInput): Promise<Lead> {
  const { data, error } = await getSupabaseAdmin().rpc("upsert_lead", {
    target_tenant_id: tenantId,
    target_phone: input.phone ?? "",
    target_name: input.name ?? null,
    target_source_group_id: input.sourceGroupId ?? null,
    target_source_group_name: input.sourceGroup ?? null,
    target_source_campaign: input.sourceCampaign ?? null,
  });
  if (error) throw new Error(error.message);
  return data as Lead;
}

export async function updateLeadStatus(
  tenantId: string,
  id: string,
  status: LeadStatus,
): Promise<Lead | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Lead) ?? null;
}

export async function removeLead(tenantId: string, id: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
