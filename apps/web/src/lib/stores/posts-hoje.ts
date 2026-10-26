import "server-only";
import type { PostsHoje } from "@/lib/painel/posts-hoje";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function ehInteiro(valor: unknown, minimo: number): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= minimo;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Confere o corpo do RPC. Resposta fora do formato lança: a tela prefere não
 * mostrar a linha do teto a mostrar uma contagem que o banco não deu.
 */
function lerFormato(dados: unknown): PostsHoje {
  if (!ehObjeto(dados) || !ehInteiro(dados.teto, 1) || !ehObjeto(dados.grupos)) {
    throw new Error("posts_hoje_por_grupo devolveu um formato inesperado.");
  }
  const grupos: Record<string, number> = {};
  for (const [jid, quantos] of Object.entries(dados.grupos)) {
    if (!ehInteiro(quantos, 0)) throw new Error("posts_hoje_por_grupo devolveu uma contagem inválida.");
    grupos[jid] = quantos;
  }
  return { teto: dados.teto, grupos };
}

/**
 * Posts de hoje por grupo da loja e o teto do dia (`public.posts_hoje_por_grupo`,
 * só `service_role`). O número do teto vive no banco; aqui só se repassa. O tenant
 * vai explícito porque o service-role passa por cima do RLS: é este parâmetro que
 * isola as lojas.
 */
export async function lerPostsHoje(tenantId: string): Promise<PostsHoje> {
  const { data, error } = await getSupabaseAdmin().rpc("posts_hoje_por_grupo", { p_tenant: tenantId });
  if (error) throw new Error(error.message);
  return lerFormato(data);
}
