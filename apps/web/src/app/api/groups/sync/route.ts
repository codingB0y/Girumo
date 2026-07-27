import { isAdminGroup } from "@/lib/evolution/admin-group";
import { fetchAllGroups, providerInstanceId } from "@/lib/evolution/client";
import { syncGroupsFromProvider } from "@/lib/stores/groups";
import { getInstance, listInstances } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";
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
 * Importa os grupos da instância conectada.
 *
 * Só o que o WhatsApp é dono é gravado — a seleção e a capacidade definidas no
 * painel sobrevivem ao sync (ver `syncGroupsFromProvider`).
 *
 * Nome de grupo é conteúdo controlado por terceiros: entra no banco como texto
 * e só pode ser renderizado via escape do JSX. Nada de `dangerouslySetInnerHTML`
 * em cima destes campos.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getTenantContext(req);

    const body = (await req.json().catch(() => ({}))) as { instance_id?: string };

    const instance = body.instance_id
      ? await getInstance(ctx.tenantId, String(body.instance_id))
      : (await listInstances(ctx.tenantId)).find((i) => i.status === "connected") ?? null;

    if (!instance) {
      return Response.json({ error: "Nenhuma instancia conectada." }, { status: 409 });
    }
    if (instance.status !== "connected") {
      return Response.json(
        { error: "A instancia precisa estar conectada para sincronizar grupos." },
        { status: 409 },
      );
    }

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id);
    const remoteGroups = await fetchAllGroups(remoteName);

    const rows = remoteGroups
      .filter((g) => typeof g.id === "string" && g.id.length > 0)
      .map((g) => ({
        whatsapp_group_id: g.id,
        name: (g.subject ?? "").trim().slice(0, 200) || "Grupo sem nome",
        members: typeof g.size === "number" && g.size >= 0 ? g.size : 0,
        // Só grupos admin alimentam captura de leads (ver admin-group.ts).
        is_admin: isAdminGroup(g, instance.phone),
      }));

    const synced = await syncGroupsFromProvider(ctx.tenantId, rows);
    const adminCount = rows.filter((r) => r.is_admin).length;

    await getSupabaseAdmin().from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      // Nenhum grupo admin, com grupos existindo, é sinal de detecção quebrada
      // — não de conta sem grupos. A engine emitia o mesmo aviso.
      level: rows.length > 0 && adminCount === 0 ? "warn" : "info",
      event: "groups.synced",
      message:
        rows.length > 0 && adminCount === 0
          ? `${synced} grupos sincronizados, mas NENHUM admin detectado — captura de leads ficará vazia.`
          : `${synced} grupos sincronizados (${adminCount} admin).`,
      metadata: { instance_id: instance.id, count: synced, admin_count: adminCount },
    });

    return Response.json({ synced, admin: adminCount });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao sincronizar grupos." }, { status: 502 });
  }
}
