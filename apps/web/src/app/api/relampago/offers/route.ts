import { fetchAllGroups, providerInstanceId } from "@/lib/evolution/client";
import { isDraftMode, validateOfferBody, type OfferBody } from "@/lib/funnels/draft-offer";
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

  const body = (await req.json().catch(() => null)) as OfferBody | null;

  const erroValidacao = validateOfferBody(body);
  if (erroValidacao) return Response.json(erroValidacao, { status: 400 });
  if (!body) return Response.json({ error: "corpo invalido" }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Funil: a oferta nasce em rascunho ligada ao broadcast da etapa e quem abre
  // e a promote_due_schedules, na hora do disparo (spec D3). Sem grupos aqui:
  // eles saem de broadcasts.group_ids na abertura.
  if (isDraftMode(body)) {
    const { data: broadcast, error: erroBroadcast } = await supabase
      .from("broadcasts")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", body.broadcastId)
      .maybeSingle();
    // Banco fora do ar ou uuid malformado (22P02) nao sao "nao encontrado": sem
    // este throw a lojista via 400 com o disparo intacto na Agenda e nada no log.
    if (erroBroadcast) throw erroBroadcast;
    if (!broadcast) return Response.json({ error: "broadcast nao encontrado" }, { status: 400 });

    // A oferta so abre dentro de app.promote_due_schedules, e ela so olha
    // agendamento pendente. Duas armadilhas que isso fecha:
    //  - disparo sem agendamento sai na hora (messages/route.ts enfileira
    //    direto) e a promote nunca o ve: a mensagem sairia e a oferta ficaria
    //    em rascunho para sempre;
    //  - disparo recorrente abre a oferta na 1a ocorrencia e, na 2a, nao acha
    //    rascunho nenhum -- a mensagem sai sem oferta e a primeira fica aberta
    //    segurando flash_offer_groups_um_aberto_uidx dos grupos.
    const { data: agendamento, error: erroAgendamento } = await supabase
      .from("schedules")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("broadcast_id", body.broadcastId)
      .eq("status", "pending")
      .eq("recurrence", "none")
      .maybeSingle();
    if (erroAgendamento) throw erroAgendamento;
    if (!agendamento) {
      return Response.json(
        {
          error:
            "A oferta so abre junto de um disparo agendado que acontece uma vez. Esse disparo nao tem agendamento pendente, ou se repete.",
        },
        { status: 400 },
      );
    }

    const { data: rascunho, error: erroRascunho } = await supabase
      .from("flash_offers")
      .insert({
        tenant_id: ctx.tenantId,
        name: body.name!.trim(),
        keyword: normalizeKeyword(body.keyword || "eu quero"),
        slots: body.slots,
        timer_seconds: body.timerMinutes ? Math.round(body.timerMinutes * 60) : null,
        status: "draft",
        broadcast_id: body.broadcastId,
        created_by: ctx.authUserId,
      })
      .select("*")
      .single();
    if (erroRascunho) {
      if (erroRascunho.code === "23505") {
        return Response.json({ error: "esse disparo ja tem uma oferta ligada" }, { status: 409 });
      }
      throw erroRascunho;
    }
    return Response.json({ offer: rascunho }, { status: 201 });
  }

  // `groupIds` vem do `/api/groups`, que expõe `id` como o whatsapp_group_id —
  // é essa a identidade de grupo em todo o painel, não o uuid da linha. Casar
  // por `id` aqui dava 500 de uuid inválido no primeiro clique em "Abrir".
  const { data: grupos, error: erroGrupos } = await supabase
    .from("groups")
    .select("id, whatsapp_group_id")
    .eq("tenant_id", ctx.tenantId)
    .in("whatsapp_group_id", body.groupIds ?? []);

  if (erroGrupos) throw erroGrupos;
  if (!grupos?.length) return Response.json({ error: "grupo nao encontrado" }, { status: 404 });

  const agora = new Date().toISOString();

  const { data: oferta, error: erroOferta } = await supabase
    .from("flash_offers")
    .insert({
      tenant_id: ctx.tenantId,
      name: body.name!.trim(),
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
    // Filtro de tenant mesmo com o id recem-inserido: com service-role o RLS
    // nao protege, o `.eq("tenant_id")` e a protecao (CLAUDE.md).
    await supabase.from("flash_offers").delete().eq("tenant_id", ctx.tenantId).eq("id", oferta.id);
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
