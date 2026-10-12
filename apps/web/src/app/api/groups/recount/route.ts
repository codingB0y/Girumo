import { sincronizarGrupos } from "@/lib/groups/sincronizar";
import { getRouteTenantContext } from "@/lib/route-tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mesmo teto do Sincronizar: o `fetchAllGroups` da Evolution chega a 50 s. */
export const maxDuration = 60;

/**
 * POST /api/groups/recount — o WORKER reconta os grupos de uma loja (1×/dia).
 *
 * Só `members` (com a proteção contra payload truncado) e `admins_*` dos grupos
 * que já estão no banco: sem grupo novo, sem remoção, sem convite. Evento de
 * webhook perdido deixava a contagem errada para sempre, e a marca automática de
 * lotado (trigger que olha `members`) nunca vinha. Spec "postar por grupo" §6.3.
 *
 * Engine-only: está no `ENGINE_ONLY` de `request-access-policy.ts` — fora dele o
 * worker levaria 401 para sempre. 409 = já há um sync deste número rodando, ou o
 * número caiu; o worker pula e tenta no dia seguinte.
 */
export async function POST(req: Request) {
  let tenantId: string;
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: true });
    // O middleware já barra quem não traz o token; isto segura se a rota sair da lista.
    if (ctx.actor !== "engine") return Response.json({ error: "Rota exclusiva da engine." }, { status: 403 });
    tenantId = ctx.tenantId;
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[api/groups/recount] falha ao resolver o tenant:", error);
    return Response.json({ error: "Erro ao recontar grupos." }, { status: 500 });
  }

  const resultado = await sincronizarGrupos(tenantId, { somenteContagem: true });
  if (!resultado.ok) return Response.json({ error: resultado.error }, { status: resultado.status });
  return Response.json({ ok: true, atualizados: resultado.synced });
}
