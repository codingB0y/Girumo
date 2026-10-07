import { after } from "next/server";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { classificarPapel } from "@/lib/communities/papel";
import {
  EvolutionError,
  FETCH_GROUPS_TIMEOUT_MS,
  fetchAllGroups,
  isEvolutionTimeout,
  providerInstanceId,
  type EvolutionGroup,
} from "@/lib/evolution/client";
import { tallyAdmins } from "@/lib/groups/admin-protection";
import { selecionarGruposSemConvite } from "@/lib/groups/invite-enqueue";
import { escolherContagem } from "@/lib/groups/member-count";
import { liberarSync, travarSync } from "@/lib/groups/sync-lock";
import { partitionByAdmin } from "@/lib/groups/sync-partition";
import {
  enqueueBulkJobs,
  listPendingCheckInviteGroupIds,
} from "@/lib/stores/group-bulk-jobs";
import { upsertParticipantesDoGrupo } from "@/lib/stores/group-participants";
import {
  listGroups,
  listMemberCounts,
  removeGroupsByWhatsappIds,
  syncGroupsFromProvider,
} from "@/lib/stores/groups";
import { espelharComunidadesNativas } from "@/lib/stores/communities";
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
  let ctx: Awaited<ReturnType<typeof getTenantContext>>;
  try {
    ctx = await getTenantContext(req);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Erro ao sincronizar grupos." }, { status: 502 });
  }

  // Id da instância cuja trava ESTE pedido segura — só ele pode liberá-la.
  let travada: string | null = null;
  let fetchMs: number | undefined;
  try {
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

    // Um sync por número de cada vez (ver sync-lock.ts). O caso comum é o
    // auto-sync de /painel/conectar ainda rodando quando o lojista clica.
    if (!(await travarSync(instance.id))) {
      return Response.json(
        {
          error:
            "Os grupos deste numero ja estao sendo sincronizados. Aguarde um minuto e atualize a pagina.",
        },
        { status: 409 },
      );
    }
    travada = instance.id;

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id);

    // Mede o fetch para a próxima decisão sobre o teto não ser chute: o log
    // carrega quanto a Evolution demorou, no sucesso e no timeout.
    //
    // Não há plano B depois de um timeout. Existiu (lista sem participantes,
    // 15s) e falhou 5 de 5 vezes entre 05 e 06/10: abortar o fetch daqui não
    // para a Evolution, e a segunda chamada entrava na fila atrás da primeira.
    const iniciouFetch = Date.now();
    let remoteGroups: EvolutionGroup[];
    try {
      remoteGroups = await fetchAllGroups(remoteName);
    } finally {
      fetchMs = Date.now() - iniciouFetch;
    }

    // Proteção do ativo (R1): "nosso" é qualquer número do tenant, não só o que
    // está sincronizando. Quando houver uma segunda instância, é ela que faz o
    // grupo deixar de depender de um único admin — e o sync precisa enxergá-la.
    const ourPhones = (await listInstances(ctx.tenantId)).map((i) => i.phone);
    const countedAt = new Date().toISOString();

    // Só entra o que administramos. Grupo onde o número é mero participante não
    // dispara, não captura lead e não cresce — guardá-lo era manter uma base de
    // contatos de terceiros parada no banco (ver sync-partition.ts).
    const { admin: gruposAdmin, descartar, deteccaoSuspeita } = partitionByAdmin(
      remoteGroups,
      instance.phone,
    );

    // Contagem já gravada, para não deixar um payload truncado apagá-la.
    const anterior = await listMemberCounts(ctx.tenantId);
    let protegidos = 0;

    const rows = gruposAdmin.map((g) => {
      const tally = tallyAdmins(g.participants, ourPhones);
      // `size` é o campo declarado pela Evolution; `participants` é a lista que
      // ela realmente entregou. Quando divergem, o maior é o que existe: um
      // `size` menor que a lista significa contagem desatualizada do lado dela,
      // e nunca o contrário — a lista não inventa gente.
      const doProvedor = Math.max(
        typeof g.size === "number" && g.size >= 0 ? g.size : 0,
        g.participants?.length ?? 0,
      );
      const contagem = escolherContagem(doProvedor, anterior.get(String(g.id)));
      if (contagem.protegido) protegidos += 1;
      const vinculo = classificarPapel({
        id: String(g.id),
        isCommunity: g.isCommunity,
        isCommunityAnnounce: g.isCommunityAnnounce,
        linkedParent: g.linkedParent,
      });
      return {
        whatsapp_group_id: String(g.id),
        name: (g.subject ?? "").trim().slice(0, 200) || "Grupo sem nome",
        members: contagem.members,
        is_admin: true,
        // Esta é a única leitura que vê a lista inteira de participantes; o
        // webhook só mantém o número vivo daqui em diante.
        admins_total: tally.total,
        admins_ours: tally.ours,
        admins_counted_at: countedAt,
        community_jid: vinculo.communityJid,
        community_role: vinculo.communityRole,
      };
    });

    const synced = await syncGroupsFromProvider(ctx.tenantId, rows);

    // Fase 3 de Comunidades: mesma leitura do sync já tem os participantes —
    // zero chamada nova à Evolution. Falha aqui não pode derrubar o sync:
    // alcance real é enriquecimento, não o que o lojista veio fazer. E não
    // pode ficar no caminho crítico da resposta: esta rota já tem
    // maxDuration=60 por causa da Evolution, `after()` roda depois que a
    // resposta já saiu (mesmo padrão de short-link-click.ts).
    after(async () => {
      const r = await Promise.allSettled(
        gruposAdmin.map((g) =>
          upsertParticipantesDoGrupo(
            ctx.tenantId,
            String(g.id),
            (g.participants ?? [])
              .filter((p): p is { id: string; phoneNumber?: string | null; admin?: string | null } => Boolean(p?.id))
              .map((p) => ({
                participantLid: p.id,
                phone: p.phoneNumber ?? null,
                isAdmin: p.admin === "admin" || p.admin === "superadmin",
              })),
          ),
        ),
      );
      const falhas = r.filter((x) => x.status === "rejected");
      if (falhas.length > 0) {
        console.error(`[api/groups/sync] ${falhas.length} grupo(s) sem participantes gravados:`, falhas[0]);
      }

      try {
        await espelharComunidadesNativas(ctx.tenantId);
      } catch (e) {
        // Espelhar comunidade é enriquecimento; falhar aqui não pode derrubar
        // um sync que o lojista veio fazer por outro motivo.
        console.error("[groups/sync] falha ao espelhar comunidades nativas:", e);
      }
    });

    // Backfill de convite pela fila do lote (15/min), no lugar do cron diário.
    // Falha aqui não pode derrubar o sync: convite é enriquecimento.
    let convitesEnfileirados = 0;
    try {
      const [grupos, jaNaFila] = await Promise.all([
        listGroups(ctx.tenantId),
        listPendingCheckInviteGroupIds(ctx.tenantId),
      ]);
      const alvos = selecionarGruposSemConvite(grupos, jaNaFila);
      if (alvos.length > 0) {
        convitesEnfileirados = await enqueueBulkJobs(
          ctx.tenantId,
          alvos.map((g) => ({
            tenant_id: ctx.tenantId,
            campaign_group_id: null,
            batch_id: crypto.randomUUID(),
            action: "check_invite" as const,
            group_id: g.id,
            whatsapp_group_id: g.whatsapp_group_id as string,
            description: null,
            media_id: null,
            target_phone: null,
          })),
        );
      }
    } catch (err) {
      console.error("[api/groups/sync] backfill de convite nao enfileirou:", err);
    }

    // Limpa o que sobrou de antes de o filtro existir. `descartar` vem vazio
    // quando a detecção é suspeita, então uma quebra de contrato da Evolution
    // não apaga a base do lojista.
    const removidos = await removeGroupsByWhatsappIds(ctx.tenantId, descartar);
    const adminCount = rows.length;
    const semBackup = rows.filter((r) => r.admins_total <= 1).length;

    // Marco de ativação. Era a única etapa do funil do admin que nunca populava
    // — o evento existia no tipo desde sempre e não tinha quem o emitisse.
    // Uma sync que não trouxe grupo nenhum não é marco: o lojista conectou mas
    // ainda não tem o que sincronizar.
    if (synced > 0) {
      void trackFunnelEvent({
        tenantId: ctx.tenantId,
        userId: ctx.authUserId,
        event: "first_group_synced",
        onlyFirst: true,
        metadata: { count: synced, adminCount },
      });
    }

    await getSupabaseAdmin().from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      // Nenhum grupo admin, com grupos existindo, é sinal de detecção quebrada
      // — não de conta sem grupos. A engine emitia o mesmo aviso.
      level: deteccaoSuspeita ? "warn" : "info",
      event: "groups.synced",
      message: deteccaoSuspeita
        ? `Nenhum grupo admin detectado entre os ${remoteGroups.length} do numero — nada foi importado nem removido.`
        : `${synced} grupos admin sincronizados (${remoteGroups.length - adminCount} ignorados por nao sermos admin, ${removidos} removidos, ${protegidos} com contagem preservada de payload truncado).`,
      metadata: {
        instance_id: instance.id,
        count: synced,
        admin_count: adminCount,
        // Quantos grupos o número participa sem administrar. Ficam de fora do
        // banco de propósito.
        ignorados: remoteGroups.length - adminCount,
        // Quantos não-admin já gravados este sync limpou.
        removidos,
        // Grupos cuja contagem antiga foi mantida porque o provedor devolveu
        // payload truncado (evolution-api#2124).
        protegidos,
        // Quantos grupos ficariam órfãos se este número caísse.
        sem_backup: semBackup,
        // Quanto a Evolution levou. Cresce com o número de grupos; é o que
        // decide se o teto (FETCH_GROUPS_TIMEOUT_MS) ainda cabe.
        fetch_ms: fetchMs,
        // Backfill de convite pela fila do lote, disparado neste mesmo sync.
        convites_enfileirados: convitesEnfileirados,
      },
    });

    return Response.json({
      synced,
      admin: adminCount,
      semBackup,
      ignorados: remoteGroups.length - adminCount,
      removidos,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return await falhaDoSync(error, ctx, fetchMs);
  } finally {
    if (travada) await liberarSync(travada);
  }
}

/**
 * Traduz a falha para o lojista e DEIXA RASTRO.
 *
 * O catch anterior devolvia 502 "Erro ao sincronizar grupos." e não gravava
 * nada: quando o sync começou a estourar o tempo em 31/08, a única evidência
 * existia no painel da Vercel, e foi preciso a CLI para descobrir que era
 * timeout. Um erro que não se registra custa uma investigação inteira toda vez.
 */
async function falhaDoSync(
  error: unknown,
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  fetchMs: number | undefined,
): Promise<Response> {
  const evo = error instanceof EvolutionError ? error : null;
  const expirou = isEvolutionTimeout(error);

  const mensagem = expirou
    ? "O WhatsApp demorou demais para responder a lista de grupos. Isso costuma acontecer logo depois de conectar ou com muitos grupos. Tente de novo em alguns minutos."
    : "Erro ao sincronizar grupos.";

  try {
    await getSupabaseAdmin().from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.authUserId,
      level: "error",
      event: "groups.sync_failed",
      message: expirou
        ? `Sync de grupos expirou: a Evolution não respondeu em ${Math.round(FETCH_GROUPS_TIMEOUT_MS / 1000)}s.`
        : `Sync de grupos falhou: ${evo ? evo.message : String(error)}`,
      metadata: {
        timeout: expirou,
        status: evo?.status ?? null,
        detail: evo?.detail ?? null,
        // Ausente quando a falha veio antes do fetch.
        fetch_ms: fetchMs ?? null,
      },
    });
  } catch (logError) {
    // Falhar ao registrar a falha não pode virar uma terceira falha: o lojista
    // ainda precisa da resposta.
    console.error("[api/groups/sync] nao consegui registrar a falha:", logError);
  }

  // 504 quando é tempo: o status diz a verdade sobre o que houve, e separa isto
  // de "a Evolution respondeu erro" nas métricas.
  return Response.json({ error: mensagem }, { status: expirou ? 504 : 502 });
}
