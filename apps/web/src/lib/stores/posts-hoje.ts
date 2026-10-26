import "server-only";
import { lerFormatoPostsHoje, type PostsHoje } from "@/lib/painel/posts-hoje";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Posts de hoje por grupo da loja e o teto do dia (`public.posts_hoje_por_grupo`,
 * só `service_role`). O número do teto vive no banco; aqui só se repassa. O tenant
 * vai explícito porque o service-role passa por cima do RLS: é este parâmetro que
 * isola as lojas.
 */
export async function lerPostsHoje(tenantId: string): Promise<PostsHoje> {
  const { data, error } = await getSupabaseAdmin().rpc("posts_hoje_por_grupo", { p_tenant: tenantId });
  if (error) throw new Error(error.message);
  // Fora do formato lança, em vez de virar contagem zero.
  const lido = lerFormatoPostsHoje(data);
  if (!lido) throw new Error("posts_hoje_por_grupo devolveu um formato inesperado.");
  return lido;
}
