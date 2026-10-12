import { sincronizarGrupos } from "@/lib/groups/sincronizar";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Evolution busca a foto de perfil de cada grupo em série antes de responder,
 * então o fetch escala com o número de grupos. O default da Vercel (10-15s)
 * cortaria o sync de quem tem muitos grupos — exatamente quem mais precisa.
 */
export const maxDuration = 60;

/**
 * Importa os grupos da instância conectada (o botão Sincronizar e o auto-sync
 * de /painel/conectar).
 *
 * Só o que o WhatsApp é dono é gravado — a seleção e a capacidade definidas no
 * painel sobrevivem ao sync (ver `syncGroupsFromProvider`). O núcleo mora em
 * `sincronizarGrupos`, que a recontagem diária (`/api/groups/recount`) reusa
 * com `somenteContagem`.
 */
export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof getTenantContext>>;
  try {
    ctx = await getTenantContext(req);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao sincronizar grupos." }, { status: 502 });
  }

  const body = (await req.json().catch(() => ({}))) as { instance_id?: string };
  const resultado = await sincronizarGrupos(ctx.tenantId, {
    somenteContagem: false,
    instanceId: body.instance_id ? String(body.instance_id) : undefined,
    actorUserId: ctx.authUserId,
  });
  if (!resultado.ok) return Response.json({ error: resultado.error }, { status: resultado.status });

  const { synced, admin, semBackup, ignorados, removidos } = resultado;
  return Response.json({ synced, admin, semBackup, ignorados, removidos });
}
