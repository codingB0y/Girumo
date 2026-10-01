import { estadoDaEntrega, type EntregaDoPost, type EntregaNoGrupo } from "@/lib/painel/entrega";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { listBroadcastDeliveries } from "@/lib/stores/broadcast-deliveries";
import { getBroadcast } from "@/lib/stores/broadcasts";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/disparos/[id]/grupos: como a rodada atual do post está em cada grupo
 * (entregue, postando, na fila, falhou ou cancelado). A tabela de grupos da
 * campanha mostra isso na coluna "Post das HH:MM".
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // O JSON de dev não tem fila de comandos: sem banco não existe entrega por grupo.
  if (!USE_SUPABASE) {
    return Response.json({ error: "A entrega por grupo precisa do banco." }, { status: 501 });
  }
  if (!UUID.test(id)) return Response.json({ error: "Post inválido." }, { status: 400 });

  try {
    const { tenantId } = await getRouteTenantContext(req, { allowEngine: false });
    const post = await getBroadcast(tenantId, id);
    if (!post) return Response.json({ error: "Post não encontrado." }, { status: 404 });

    // Rascunho e post do motor antigo não têm rodada: nada saiu por esta fila.
    const grupos: EntregaNoGrupo[] = [];
    if (post.run_id) {
      for (const linha of await listBroadcastDeliveries(tenantId, post.id, post.run_id)) {
        const estado = estadoDaEntrega(linha.status);
        if (!estado || !linha.jid) continue;
        grupos.push({ grupo: linha.jid, estado, quando: linha.completed_at ?? linha.failed_at });
      }
    }

    const resposta: EntregaDoPost = { postId: post.id, desde: post.running_since, grupos };
    return Response.json(resposta);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/disparos/grupos] falha ao ler a entrega:", error);
    return Response.json({ error: "Não deu para ler a entrega do post." }, { status: 500 });
  }
}
