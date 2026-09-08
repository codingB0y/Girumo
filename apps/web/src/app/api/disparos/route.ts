import { USE_SUPABASE } from "@/lib/stores/use-supabase";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { carregarDisparos } from "@/lib/painel/inicio-carga";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/disparos — todos os disparos do tenant, de todas as campanhas.
 *
 * Existe separado de `/api/campanhas/[slug]/messages` (que é por campanha) e de
 * `/api/broadcasts` (que devolve a forma legada e não traz campanha nem
 * agendamento). A página /painel/disparos precisa das três coisas juntas:
 * progresso real (`sent/total`), de qual campanha veio, e o agendamento pendente.
 *
 * Somente leitura: quem dispara continua sendo a rota da campanha, que já tem
 * os gates de permissão, plano e sessão viva. Duplicar isso aqui seria criar um
 * segundo caminho de envio pra manter em sincronia.
 */
export async function GET(req: Request) {
  // Sem Supabase não existe pipeline de broadcasts — a página mostra vazio em
  // vez de quebrar (o fallback JSON nunca teve disparo de verdade). Sai ANTES de
  // resolver o tenant, que é o que a rota sempre fez.
  if (!USE_SUPABASE) return Response.json([]);

  const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
  return Response.json(await carregarDisparos(tenantId));
}
