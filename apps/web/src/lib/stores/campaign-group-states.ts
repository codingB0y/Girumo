import "server-only";
import { estadoFromRow, type EstadoGrupo, type EstadoRow } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Estados dos grupos de UMA campanha, na ordem do pool
 * (`public.campaign_group_states`, PR 1 do "postar por grupo").
 *
 * O tenant vai explícito porque o service-role passa por cima do RLS: é
 * `p_tenant` que isola as lojas. A RPC só devolve grupos da campanha que existem
 * em `groups` — JID órfão do pool não sai (o `diagnosePool` do link trata).
 *
 * Erro da RPC lança: devolver `[]` faria o link dizer "campanha não está aberta"
 * para uma campanha cheia de grupo, sem rastro nenhum.
 */
export async function listCampaignGroupStates(tenantId: string, campaignId: string): Promise<EstadoGrupo[]> {
  const { data, error } = await getSupabaseAdmin().rpc("campaign_group_states", {
    p_tenant: tenantId,
    p_campaign: campaignId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as EstadoRow[]).map(estadoFromRow);
}

/** Resultados de `public.marcar_grupo_lotado` (contratos §1). */
const RESULTADOS_MARCAR = ["ok", "ja_lotado", "nao_encontrado"] as const;
/** Resultados de `public.reabrir_grupo` (contratos §1). */
const RESULTADOS_REABRIR = ["ok", "nao_lotado", "ainda_cheio", "nao_encontrado"] as const;

/**
 * Texto fora do contrato é erro alto. Virar 200 ou 404 por engano esconderia uma função
 * trocada no banco — e a rota mapeia cada resultado para um status.
 */
function resultadoDoRpc<T extends string>(rpc: string, validos: readonly T[], valor: unknown): T {
  if (typeof valor === "string" && (validos as readonly string[]).includes(valor)) return valor as T;
  throw new Error(`${rpc} devolveu um resultado fora do contrato: ${JSON.stringify(valor)}`);
}

/**
 * Marca o grupo como lotado à mão (`lotado_por = 'manual'`, spec D1). Sai do link na hora.
 * O tenant vai no `where` do próprio RPC: grupo de outra loja volta `nao_encontrado`.
 */
export async function marcarGrupoLotado(
  tenantId: string,
  groupId: string,
): Promise<"ok" | "ja_lotado" | "nao_encontrado"> {
  const { data, error } = await getSupabaseAdmin().rpc("marcar_grupo_lotado", { p_tenant: tenantId, p_group: groupId });
  if (error) throw new Error(error.message);
  return resultadoDoRpc("marcar_grupo_lotado", RESULTADOS_MARCAR, data);
}

/**
 * Tira a marca e dá prioridade no link (spec D2/D3). Recusa com `ainda_cheio` enquanto o grupo
 * está em 95% ou mais — a condição mora no `where` do UPDATE, sem corrida entre checar e gravar.
 */
export async function reabrirGrupo(
  tenantId: string,
  groupId: string,
): Promise<"ok" | "nao_lotado" | "ainda_cheio" | "nao_encontrado"> {
  const { data, error } = await getSupabaseAdmin().rpc("reabrir_grupo", { p_tenant: tenantId, p_group: groupId });
  if (error) throw new Error(error.message);
  return resultadoDoRpc("reabrir_grupo", RESULTADOS_REABRIR, data);
}
