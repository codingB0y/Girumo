import "server-only";
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
import { enqueueBulkJobs, listPendingCheckInviteGroupIds } from "@/lib/stores/group-bulk-jobs";
import { upsertParticipantesDoGrupo } from "@/lib/stores/group-participants";
import {
  listGroups,
  listMemberCounts,
  removeGroupsByWhatsappIds,
  syncGroupsFromProvider,
  updateGroupCounts,
} from "@/lib/stores/groups";
import { espelharComunidadesNativas } from "@/lib/stores/communities";
import { getInstance, listInstances, type Instance } from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Núcleo do sync de grupos (Evolution → `groups`), extraído de
 * `POST /api/groups/sync` para a recontagem diária reusar (spec "postar por
 * grupo" §6.3).
 *
 * Dois modos:
 * - completo (`somenteContagem: false`): o botão Sincronizar e o auto-sync de
 *   /painel/conectar. Importa grupo novo, grava nome/admin/comunidade, apaga o que
 *   deixou de ser nosso, grava os participantes e enfileira a revisão de convite.
 *   O comportamento de sempre.
 * - recontagem (`somenteContagem: true`): o worker, 1×/dia. Só `members` (com a
 *   proteção contra payload truncado) e `admins_*` dos grupos que JÁ estão no
 *   banco. Não importa, não apaga, não mexe em convite nem em participante.
 *
 * Os dois respeitam a trava de um sync por número (#397).
 *
 * Nome de grupo é conteúdo controlado por terceiros: entra no banco como texto e
 * só pode ser renderizado via escape do JSX. Nada de `dangerouslySetInnerHTML`.
 */

export type OpcoesDoSync = {
  somenteContagem: boolean;
  /** Instância escolhida no painel; sem ela, a primeira conectada. */
  instanceId?: string;
  /** Quem pediu, para `logs` e funil. Nulo quando é o worker. */
  actorUserId?: string | null;
  /**
   * Quem roda o que fica para depois da resposta (participantes e comunidades).
   * A rota não passa nada e usa o `after` do Next; só o teste passa outro,
   * porque fora de uma request o `after` lança.
   */
  depois?: (tarefa: () => Promise<void>) => void;
};

export type ResultadoDoSync =
  | { ok: true; synced: number; admin: number; semBackup: number; ignorados: number; removidos: number }
  | { ok: false; status: 409 | 502 | 504; error: string };

/** Linha que o sync grava em `groups` (o payload de `syncGroupsFromProvider`). */
type LinhaDoSync = Parameters<typeof syncGroupsFromProvider>[1][number];

/** O que os dois modos já sabem depois de ler a Evolution. */
type Leitura = {
  tenantId: string;
  actorUserId: string | null;
  depois: (tarefa: () => Promise<void>) => void;
  instance: Instance;
  remoteGroups: EvolutionGroup[];
  fetchMs: number | undefined;
  gruposAdmin: EvolutionGroup[];
  descartar: string[];
  deteccaoSuspeita: boolean;
  anterior: Map<string, number>;
  rows: LinhaDoSync[];
  protegidos: number;
  /** Os grupos contados em `protegidos`, pelo id do WhatsApp. */
  jidsProtegidos: Set<string>;
};

const MENSAGEM_TRAVADO =
  "Os grupos deste numero ja estao sendo sincronizados. Aguarde um minuto e atualize a pagina.";

export async function sincronizarGrupos(tenantId: string, opts: OpcoesDoSync): Promise<ResultadoDoSync> {
  const actorUserId = opts.actorUserId ?? null;
  // Id da instância cuja trava ESTA chamada segura — só ela pode liberá-la.
  let travada: string | null = null;
  let fetchMs: number | undefined;
  try {
    const instance = opts.instanceId
      ? await getInstance(tenantId, opts.instanceId)
      : ((await listInstances(tenantId)).find((i) => i.status === "connected") ?? null);
    if (!instance) return { ok: false, status: 409, error: "Nenhuma instancia conectada." };
    if (instance.status !== "connected") {
      return { ok: false, status: 409, error: "A instancia precisa estar conectada para sincronizar grupos." };
    }

    // Um sync por número de cada vez (ver sync-lock.ts). O caso comum é o
    // auto-sync de /painel/conectar ainda rodando quando o lojista clica — e,
    // desde a recontagem diária, o worker passando na mesma hora.
    if (!(await travarSync(instance.id))) return { ok: false, status: 409, error: MENSAGEM_TRAVADO };
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

    const leitura = await lerGrupos({
      tenantId,
      actorUserId,
      depois: opts.depois ?? after,
      instance,
      remoteGroups,
      fetchMs,
    });
    return opts.somenteContagem ? await gravarRecontagem(leitura) : await gravarSyncCompleto(leitura);
  } catch (error) {
    return await falhaDoSync(error, { tenantId, actorUserId, fetchMs, somenteContagem: opts.somenteContagem });
  } finally {
    if (travada) await liberarSync(travada);
  }
}

/** Contagem e admins de cada grupo que administramos — a parte que os dois modos gravam. */
async function lerGrupos(
  base: Pick<Leitura, "tenantId" | "actorUserId" | "depois" | "instance" | "remoteGroups" | "fetchMs">,
): Promise<Leitura> {
  // Proteção do ativo (R1): "nosso" é qualquer número do tenant, não só o que
  // está sincronizando. Quando houver uma segunda instância, é ela que faz o
  // grupo deixar de depender de um único admin — e o sync precisa enxergá-la.
  const ourPhones = (await listInstances(base.tenantId)).map((i) => i.phone);
  const countedAt = new Date().toISOString();

  // Só entra o que administramos. Grupo onde o número é mero participante não
  // dispara, não captura lead e não cresce — guardá-lo era manter uma base de
  // contatos de terceiros parada no banco (ver sync-partition.ts).
  const { admin: gruposAdmin, descartar, deteccaoSuspeita } = partitionByAdmin(
    base.remoteGroups,
    base.instance.phone,
  );

  // Contagem já gravada, para não deixar um payload truncado apagá-la.
  const anterior = await listMemberCounts(base.tenantId);
  const linhas = gruposAdmin.map((g) => linhaDoGrupo(g, ourPhones, countedAt, anterior.get(String(g.id))));

  return {
    ...base,
    gruposAdmin,
    descartar,
    deteccaoSuspeita,
    anterior,
    rows: linhas.map((l) => l.linha),
    protegidos: linhas.filter((l) => l.protegido).length,
    jidsProtegidos: new Set(linhas.filter((l) => l.protegido).map((l) => l.linha.whatsapp_group_id)),
  };
}

function linhaDoGrupo(
  g: EvolutionGroup,
  ourPhones: (string | null)[],
  countedAt: string,
  jaGravado: number | undefined,
): { linha: LinhaDoSync; protegido: boolean } {
  const tally = tallyAdmins(g.participants, ourPhones);
  // `size` é o campo declarado pela Evolution; `participants` é a lista que
  // ela realmente entregou. Quando divergem, o maior é o que existe: um
  // `size` menor que a lista significa contagem desatualizada do lado dela,
  // e nunca o contrário — a lista não inventa gente.
  const doProvedor = Math.max(
    typeof g.size === "number" && g.size >= 0 ? g.size : 0,
    g.participants?.length ?? 0,
  );
  const contagem = escolherContagem(doProvedor, jaGravado);
  const vinculo = classificarPapel({
    id: String(g.id),
    isCommunity: g.isCommunity,
    isCommunityAnnounce: g.isCommunityAnnounce,
    linkedParent: g.linkedParent,
  });
  return {
    protegido: contagem.protegido,
    linha: {
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
    },
  };
}

/**
 * Recontagem: só os grupos que JÁ estão no banco, só contagem. Importar grupo
 * novo ou apagar o que deixou de ser nosso é decisão do Sincronizar, que o
 * lojista vê acontecer — fazer isso de madrugada mudaria a lista dele sem
 * ninguém pedir.
 */
async function gravarRecontagem(l: Leitura): Promise<ResultadoDoSync> {
  // Grupo de payload truncado fica de fora: o `members` dele não mudaria, e os
  // `admins_*` e o `name` viriam desse payload truncado (só o "self"), o que o
  // marcaria "sem admin reserva" por engano. O Sincronizar do painel segue
  // gravando esses grupos como sempre.
  const contagens = l.rows
    .filter((r) => l.anterior.has(r.whatsapp_group_id) && !l.jidsProtegidos.has(r.whatsapp_group_id))
    .map((r) => ({
      whatsapp_group_id: r.whatsapp_group_id,
      name: r.name,
      members: r.members,
      admins_total: r.admins_total,
      admins_ours: r.admins_ours,
      admins_counted_at: r.admins_counted_at,
    }));
  const atualizados = await updateGroupCounts(l.tenantId, contagens);
  const semBackup = contagens.filter((r) => r.admins_total <= 1).length;

  await registrarLog(
    l,
    "groups.recounted",
    `${atualizados} grupos recontados (${l.protegidos} com contagem preservada de payload truncado).`,
    { count: atualizados, removidos: 0, sem_backup: semBackup, convites_enfileirados: 0 },
  );
  return {
    ok: true,
    synced: atualizados,
    admin: contagens.length,
    semBackup,
    ignorados: l.remoteGroups.length - l.rows.length,
    removidos: 0,
  };
}

/** O Sincronizar do painel: o comportamento de sempre de `POST /api/groups/sync`. */
async function gravarSyncCompleto(l: Leitura): Promise<ResultadoDoSync> {
  const synced = await syncGroupsFromProvider(l.tenantId, l.rows);
  gravarParticipantesDepois(l);
  const convitesEnfileirados = await enfileirarConvites(l.tenantId);

  // Limpa o que sobrou de antes de o filtro existir. `descartar` vem vazio
  // quando a detecção é suspeita, então uma quebra de contrato da Evolution
  // não apaga a base do lojista.
  const removidos = await removeGroupsByWhatsappIds(l.tenantId, l.descartar);
  const admin = l.rows.length;
  const semBackup = l.rows.filter((r) => r.admins_total <= 1).length;
  const ignorados = l.remoteGroups.length - admin;

  // Marco de ativação. Era a única etapa do funil do admin que nunca populava
  // — o evento existia no tipo desde sempre e não tinha quem o emitisse.
  // Uma sync que não trouxe grupo nenhum não é marco: o lojista conectou mas
  // ainda não tem o que sincronizar.
  if (synced > 0) {
    void trackFunnelEvent({
      tenantId: l.tenantId,
      userId: l.actorUserId,
      event: "first_group_synced",
      onlyFirst: true,
      metadata: { count: synced, adminCount: admin },
    });
  }

  await registrarLog(
    l,
    "groups.synced",
    `${synced} grupos admin sincronizados (${ignorados} ignorados por nao sermos admin, ${removidos} removidos, ${l.protegidos} com contagem preservada de payload truncado).`,
    { count: synced, removidos, sem_backup: semBackup, convites_enfileirados: convitesEnfileirados },
  );
  return { ok: true, synced, admin, semBackup, ignorados, removidos };
}

/**
 * Fase 3 de Comunidades: a mesma leitura do sync já tem os participantes —
 * zero chamada nova à Evolution. Falha aqui não pode derrubar o sync: alcance
 * real é enriquecimento, não o que o lojista veio fazer. E não pode ficar no
 * caminho crítico da resposta: a rota já tem maxDuration=60 por causa da
 * Evolution; `after()` roda depois que a resposta já saiu.
 */
function gravarParticipantesDepois(l: Leitura): void {
  l.depois(async () => {
    const r = await Promise.allSettled(
      l.gruposAdmin.map((g) =>
        upsertParticipantesDoGrupo(
          l.tenantId,
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
      console.error(`[groups/sincronizar] ${falhas.length} grupo(s) sem participantes gravados:`, falhas[0]);
    }

    try {
      await espelharComunidadesNativas(l.tenantId);
    } catch (e) {
      // Espelhar comunidade é enriquecimento; falhar aqui não pode derrubar
      // um sync que o lojista veio fazer por outro motivo.
      console.error("[groups/sincronizar] falha ao espelhar comunidades nativas:", e);
    }
  });
}

/**
 * Backfill de convite pela fila do lote (15/min), no lugar do cron diário.
 * Falha aqui não pode derrubar o sync: convite é enriquecimento.
 */
async function enfileirarConvites(tenantId: string): Promise<number> {
  try {
    const [grupos, jaNaFila] = await Promise.all([listGroups(tenantId), listPendingCheckInviteGroupIds(tenantId)]);
    const alvos = selecionarGruposSemConvite(grupos, jaNaFila);
    if (alvos.length === 0) return 0;
    return await enqueueBulkJobs(
      tenantId,
      alvos.map((g) => ({
        tenant_id: tenantId,
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
  } catch (err) {
    console.error("[groups/sincronizar] backfill de convite nao enfileirou:", err);
    return 0;
  }
}

async function registrarLog(
  l: Leitura,
  evento: "groups.synced" | "groups.recounted",
  mensagem: string,
  extra: { count: number; removidos: number; sem_backup: number; convites_enfileirados: number },
): Promise<void> {
  await getSupabaseAdmin().from("logs").insert({
    tenant_id: l.tenantId,
    actor_user_id: l.actorUserId,
    // Nenhum grupo admin, com grupos existindo, é sinal de detecção quebrada
    // — não de conta sem grupos. A engine emitia o mesmo aviso.
    level: l.deteccaoSuspeita ? "warn" : "info",
    event: evento,
    message: l.deteccaoSuspeita
      ? `Nenhum grupo admin detectado entre os ${l.remoteGroups.length} do numero — nada foi importado nem removido.`
      : mensagem,
    metadata: {
      instance_id: l.instance.id,
      count: extra.count,
      admin_count: l.rows.length,
      // Quantos grupos o número participa sem administrar. Ficam de fora do
      // banco de propósito.
      ignorados: l.remoteGroups.length - l.rows.length,
      // Quantos não-admin já gravados este sync limpou.
      removidos: extra.removidos,
      // Grupos cuja contagem antiga foi mantida porque o provedor devolveu
      // payload truncado (evolution-api#2124).
      protegidos: l.protegidos,
      // Quantos grupos ficariam órfãos se este número caísse.
      sem_backup: extra.sem_backup,
      // Quanto a Evolution levou. Cresce com o número de grupos; é o que
      // decide se o teto (FETCH_GROUPS_TIMEOUT_MS) ainda cabe.
      fetch_ms: l.fetchMs,
      // Backfill de convite pela fila do lote, disparado neste mesmo sync.
      convites_enfileirados: extra.convites_enfileirados,
    },
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
  ctx: { tenantId: string; actorUserId: string | null; fetchMs: number | undefined; somenteContagem: boolean },
): Promise<ResultadoDoSync> {
  const evo = error instanceof EvolutionError ? error : null;
  const expirou = isEvolutionTimeout(error);

  const mensagem = expirou
    ? "O WhatsApp demorou demais para responder a lista de grupos. Isso costuma acontecer logo depois de conectar ou com muitos grupos. Tente de novo em alguns minutos."
    : "Erro ao sincronizar grupos.";

  try {
    await getSupabaseAdmin().from("logs").insert({
      tenant_id: ctx.tenantId,
      actor_user_id: ctx.actorUserId,
      level: "error",
      event: ctx.somenteContagem ? "groups.recount_failed" : "groups.sync_failed",
      message: expirou
        ? `Sync de grupos expirou: a Evolution não respondeu em ${Math.round(FETCH_GROUPS_TIMEOUT_MS / 1000)}s.`
        : `Sync de grupos falhou: ${evo ? evo.message : String(error)}`,
      metadata: {
        timeout: expirou,
        status: evo?.status ?? null,
        detail: evo?.detail ?? null,
        // Ausente quando a falha veio antes do fetch.
        fetch_ms: ctx.fetchMs ?? null,
      },
    });
  } catch (logError) {
    // Falhar ao registrar a falha não pode virar uma terceira falha: o lojista
    // ainda precisa da resposta.
    console.error("[groups/sincronizar] nao consegui registrar a falha:", logError);
  }

  // 504 quando é tempo: o status diz a verdade sobre o que houve, e separa isto
  // de "a Evolution respondeu erro" nas métricas.
  return { ok: false, status: expirou ? 504 : 502, error: mensagem };
}
