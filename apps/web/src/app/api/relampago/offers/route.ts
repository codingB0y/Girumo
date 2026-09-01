import { fetchAllGroups, providerInstanceId } from "@/lib/evolution/client";
import { normalizeKeyword } from "@/lib/relampago/keyword";
import { lidMapFromParticipants, mergeLidMaps } from "@/lib/relampago/lid-map";
import { lidMapFromHistory, listOffers } from "@/lib/stores/flash-offers";
import { listInstances } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/supabase/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await getTenantContext(req);
    return Response.json({ offers: await listOffers(ctx.tenantId) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

/**
 * Cria a oferta E abre a janela nos grupos, numa coisa só. Não existe oferta
 * criada-mas-não-aberta útil: o valor inteiro está na janela estar aberta quando
 * a lojista posta a promoção.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    keyword?: string;
    slots?: number;
    timerMinutes?: number | null;
    groupIds?: string[];
  } | null;

  if (!body?.name?.trim()) return Response.json({ error: "nome obrigatorio" }, { status: 400 });
  if (!Number.isInteger(body.slots) || (body.slots ?? 0) < 1) {
    return Response.json({ error: "informe quantas pecas" }, { status: 400 });
  }
  if (!body.groupIds?.length) {
    return Response.json({ error: "escolha ao menos um grupo" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: grupos, error: erroGrupos } = await supabase
    .from("groups")
    .select("id, whatsapp_group_id")
    .eq("tenant_id", ctx.tenantId)
    .in("id", body.groupIds);

  if (erroGrupos) throw erroGrupos;
  if (!grupos?.length) return Response.json({ error: "grupo nao encontrado" }, { status: 404 });

  const agora = new Date().toISOString();

  const { data: oferta, error: erroOferta } = await supabase
    .from("flash_offers")
    .insert({
      tenant_id: ctx.tenantId,
      name: body.name.trim(),
      keyword: normalizeKeyword(body.keyword || "eu quero"),
      slots: body.slots,
      timer_seconds: body.timerMinutes ? Math.round(body.timerMinutes * 60) : null,
      status: "open",
      opened_at: agora,
      created_by: ctx.authUserId,
    })
    .select("*")
    .single();

  if (erroOferta) throw erroOferta;

  // O mapa @lid -> telefone. Uma chamada à Evolution por abertura, não por
  // comentário: 100% dos participantes chegam como @lid e sem isso a fila fica
  // bonita e inútil.
  let participantesPorGrupo: Record<string, Record<string, string>> = {};
  try {
    const instancias = await listInstances(ctx.tenantId);
    const conectada = instancias.find((i) => i.status === "connected");
    if (conectada) {
      const todos = await fetchAllGroups(providerInstanceId(conectada.id));
      participantesPorGrupo = Object.fromEntries(
        todos.map((g) => [g.id, lidMapFromParticipants(g)]),
      );
    }
  } catch (e) {
    // Falhar aqui não pode impedir a abertura: sem mapa a fila ainda registra
    // quem comentou, e a tela oferece responder no grupo.
    console.error("[relampago] lid_map ao vivo indisponivel:", e);
  }

  const linhas = await Promise.all(
    grupos.map(async (g) => ({
      tenant_id: ctx.tenantId,
      offer_id: oferta.id,
      group_id: g.id,
      whatsapp_group_id: g.whatsapp_group_id,
      opened_at: agora,
      lid_map: mergeLidMaps(
        participantesPorGrupo[g.whatsapp_group_id] ?? {},
        await lidMapFromHistory(ctx.tenantId, g.whatsapp_group_id),
      ),
    })),
  );

  const { error: erroJanela } = await supabase.from("flash_offer_groups").insert(linhas);

  if (erroJanela) {
    // 23505 = já existe oferta aberta num desses grupos. Recusado pelo Postgres,
    // não pela tela. Desfaz a oferta órfã.
    await supabase.from("flash_offers").delete().eq("id", oferta.id);
    if (erroJanela.code === "23505") {
      return Response.json(
        { error: "Um desses grupos ja tem uma oferta aberta. Feche a anterior primeiro." },
        { status: 409 },
      );
    }
    throw erroJanela;
  }

  return Response.json({ offer: oferta }, { status: 201 });
}
