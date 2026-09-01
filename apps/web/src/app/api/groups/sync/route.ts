import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import {
  EvolutionError,
  FETCH_GROUPS_TIMEOUT_MS,
  fetchAllGroups,
  fetchAllGroupsLight,
  isEvolutionTimeout,
  providerInstanceId,
  type EvolutionGroup,
} from "@/lib/evolution/client";
import { tallyAdmins } from "@/lib/groups/admin-protection";
import { escolherContagem } from "@/lib/groups/member-count";
import { partitionByAdmin } from "@/lib/groups/sync-partition";
import {
  listMemberCounts,
  refreshMembersForKnownGroups,
  removeGroupsByWhatsappIds,
  syncGroupsFromProvider,
} from "@/lib/stores/groups";
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

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id);

    // Mede o fetch para a próxima decisão sobre o teto não ser chute: o log de
    // sucesso passa a carregar quanto a Evolution demorou. Foi a informação que
    // faltou para escolher o timeout com fundamento em 31/08.
    const iniciouFetch = Date.now();
    let remoteGroups: EvolutionGroup[];
    try {
      remoteGroups = await fetchAllGroups(remoteName);
    } catch (error) {
      // Estourar o tempo com a lista completa não pode ser o fim da linha: era
      // aqui que o sync morria seis vezes seguidas em 01/09 sem entregar nada.
      // A lista sem participantes custa muito menos e ainda atualiza a
      // contagem — só não pode criar nem remover grupo, porque sem
      // `participants` não há como saber quem administra o quê.
      if (!isEvolutionTimeout(error)) throw error;
      return await syncLeve(ctx, instance.id, remoteName, Date.now() - iniciouFetch);
    }
    const fetchMs = Date.now() - iniciouFetch;

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
      };
    });

    const synced = await syncGroupsFromProvider(ctx.tenantId, rows);
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
        // decide se o teto de 50s ainda cabe.
        fetch_ms: fetchMs,
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
    return await falhaDoSync(error, ctx);
  }
}

/**
 * Plano B: atualiza só a contagem de membros, sem participantes.
 *
 * Vale porque o caminho completo já falhou — o lojista estava com dado
 * congelado e nenhuma alternativa. O que ele NÃO faz é tão importante quanto o
 * que faz: não cria grupo (não sabe se é admin) e não remove nenhum (a
 * ausência aqui não prova nada). O filtro de admin continua sendo do sync
 * completo.
 *
 * O log carrega os dois tempos. É a medição que faltava para decidir se o
 * problema é volume de dados ou a Evolution inteira estar lenta — e ela sai de
 * graça, da própria tentativa de recuperação.
 */
async function syncLeve(
  ctx: Awaited<ReturnType<typeof getTenantContext>>,
  instanceId: string,
  remoteName: string,
  fetchPesadoMs: number,
): Promise<Response> {
  const iniciou = Date.now();
  let leves: EvolutionGroup[];
  try {
    leves = await fetchAllGroupsLight(remoteName);
  } catch (error) {
    // Os dois caminhos falharam: aí sim é a Evolution, não o tamanho da
    // resposta. `falhaDoSync` registra e traduz.
    return await falhaDoSync(error, ctx, { fetchPesadoMs, fetchLeveMs: Date.now() - iniciou });
  }
  const fetchLeveMs = Date.now() - iniciou;

  // Mesma proteção do caminho completo: a lista leve também vem truncada para
  // parte dos grupos, e aqui não há nem `participants` para contrastar.
  const anterior = await listMemberCounts(ctx.tenantId);
  let protegidos = 0;
  const counts = leves
    .filter((g) => typeof g.id === "string" && g.id.length > 0)
    .map((g) => {
      const contagem = escolherContagem(
        typeof g.size === "number" && g.size >= 0 ? g.size : 0,
        anterior.get(String(g.id)),
      );
      if (contagem.protegido) protegidos += 1;
      return { whatsapp_group_id: String(g.id), members: contagem.members };
    });
  const atualizados = await refreshMembersForKnownGroups(ctx.tenantId, counts);

  await getSupabaseAdmin().from("logs").insert({
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.authUserId,
    level: "warn",
    event: "groups.synced_partial",
    message: `A lista completa expirou em ${Math.round(fetchPesadoMs / 1000)}s; atualizei so a contagem de ${atualizados} grupo(s) em ${Math.round(fetchLeveMs / 1000)}s. Grupo novo nao entra por este caminho.`,
    metadata: {
      instance_id: instanceId,
      atualizados,
      protegidos,
      grupos_no_provedor: leves.length,
      fetch_pesado_ms: fetchPesadoMs,
      fetch_leve_ms: fetchLeveMs,
    },
  });

  return Response.json({
    synced: atualizados,
    parcial: true,
    motivo: "A lista completa demorou demais. Atualizei o numero de membros dos grupos que ja estavam aqui; grupo novo entra na proxima sincronizacao que completar.",
  });
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
  tempos?: { fetchPesadoMs: number; fetchLeveMs: number },
): Promise<Response> {
  const evo = error instanceof EvolutionError ? error : null;
  const expirou = isEvolutionTimeout(error);

  const mensagem = expirou
    ? tempos
      ? "O WhatsApp não respondeu nem a lista completa nem a reduzida. Isso costuma ser instabilidade da conexão, não o tamanho da sua conta — tente de novo em alguns minutos."
      : "O WhatsApp demorou demais para responder a lista de grupos. Isso costuma acontecer quando você tem muitos grupos. Tente de novo em alguns minutos."
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
        // Presentes quando o plano B também falhou: os dois tempos separam
        // "resposta grande demais" de "Evolution fora do ar".
        ...(tempos
          ? { fetch_pesado_ms: tempos.fetchPesadoMs, fetch_leve_ms: tempos.fetchLeveMs }
          : {}),
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
