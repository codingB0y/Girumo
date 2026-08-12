import { isCronAuthorized } from "@/lib/cron-auth";
import { EvolutionError, fetchInviteCode, providerInstanceId } from "@/lib/evolution/client";
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "@/lib/groups/invite-backfill";
import { isConnectedStatus, selectSessionRow } from "@/lib/session-select";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O loop em série chega a 10 chamadas à Evolution por instância conectada, e o
 * timeout default do client já é 10s por chamada — o default da Vercel
 * (10-15s) cortaria o batch no meio. Corte no meio não é destrutivo (o que já
 * foi gravado persiste, a próxima execução em 10min continua a fila), só
 * atrasa o backfill — mas não há motivo pra pagar esse atraso de graça.
 */
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Quantos convites buscar por instância em CADA execução.
 *
 * Este número junto com a cadência do cron (a cada 10 min, em vercel.json) É o
 * rate limiter: 10/10min, o mesmo teto do bucket `invite` do group-guard da
 * engine. Não existe bucket em memória aqui de propósito — o agendador é
 * durável, um processo que morre no meio não libera rajada no próximo boot.
 *
 * O limite é POR INSTÂNCIA porque o teto do WhatsApp é por conta, e cada tenant
 * tem o seu número.
 *
 * Mexer aqui sem mexer no `schedule` do vercel.json quebra a política.
 */
const MAX_PER_INSTANCE_PER_RUN = 10;

/** Só o que a seleção da sessão precisa de `instances` (ver `session-select.ts`). */
type InstanceRow = {
  id: string;
  tenant_id: string | null;
  provider_instance_id: string | null;
  status: string | null;
  updated_at: string | null;
};

/**
 * GET /api/cron/group-invites
 * Chamado por Vercel Cron (vercel.json) com Authorization Bearer.
 *
 * Preenche `groups.invite_url` dos grupos onde somos admin e o campo está
 * vazio. É o insumo do link mestre `/r/<slug>` e do auto-grow — sem ele as duas
 * features ficam corretas e inertes.
 *
 * Falha definitiva (perdi admin, grupo travado, convite revogado) grava
 * `metadata.inviteFetch` e tira o grupo da fila para sempre: o cron não pode
 * bater eternamente num grupo impossível. O resgate é manual, pela rota PATCH
 * (ver Task 5) — nunca automático.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { filled: 0, failed: 0, skipped: 0, remaining: 0 };

  // Marca o grupo como falha permanente: sai da fila do backfill pra sempre
  // (o resgate é manual, via PATCH). O filtro por tenant_id é a proteção
  // real do update — o service-role bypassa RLS.
  const markPermanentFailure = async (tenantId: string, group: BackfillCandidate, reason: string) => {
    const marker = buildInviteFetchMarker(reason, now);
    const { error: markError } = await supabase
      .from("groups")
      .update({ metadata: { ...(group.metadata ?? {}), inviteFetch: marker } })
      .eq("tenant_id", tenantId)
      .eq("id", group.id);

    if (markError) {
      // Marcador não gravado = o grupo continua na fila e o cron volta a bater
      // nele a cada 10min, exatamente o que a marcação existe pra evitar.
      console.error(`[cron] group-invites: falha marcando ${group.id} como definitivo:`, markError.message);
    }
    results.failed++;
  };

  const { data: instanceRows, error: instancesError } = await supabase
    .from("instances")
    .select("id, tenant_id, provider_instance_id, status, updated_at");

  if (instancesError) {
    console.error("[cron] group-invites: falha lendo instances:", instancesError.message);
    return Response.json({ error: "instances unavailable" }, { status: 500 });
  }

  // Um tenant tem VÁRIAS linhas em `instances` (connected, qr, connecting,
  // disconnected). Filtrar por status no SQL e iterar o resultado processaria o
  // mesmo número do lojista duas vezes num run — 20 chamadas onde a política
  // permite 10 — e ainda usaria o instanceName de uma linha morta, que a
  // Evolution responde com erro sem padrão reconhecível: `classifyInviteFailure`
  // devolveria "permanent" e mataria grupos saudáveis.
  //
  // Uma linha por tenant, pela mesma regra do painel e do outro cron.
  const byTenant = new Map<string, InstanceRow[]>();
  for (const row of (instanceRows ?? []) as InstanceRow[]) {
    if (!row.tenant_id) continue;
    const rows = byTenant.get(row.tenant_id);
    if (rows) rows.push(row);
    else byTenant.set(row.tenant_id, [row]);
  }

  let processedInstances = 0;

  for (const [tenantId, rows] of byTenant) {
    const instance = selectSessionRow(rows);
    // `isConnectedStatus` em vez de `status === "connected"`: "online" também é
    // sessão viva (escrito pelo engine-health) e o resto do app já trata assim.
    if (!instance || !isConnectedStatus(instance.status)) continue;
    processedInstances++;

    // O filtro por tenant_id é a proteção real: o service-role bypassa RLS.
    const { data: groups, error: groupsError } = await supabase
      .from("groups")
      .select("id, whatsapp_group_id, name, members, is_admin, invite_url, metadata")
      .eq("tenant_id", tenantId);

    if (groupsError) {
      console.error(`[cron] group-invites: falha lendo groups de ${tenantId}:`, groupsError.message);
      results.failed++;
      continue;
    }

    const all = (groups ?? []) as BackfillCandidate[];
    const candidates = selectBackfillCandidates(all, MAX_PER_INSTANCE_PER_RUN);
    const pending = selectBackfillCandidates(all, all.length).length;
    results.remaining += Math.max(0, pending - candidates.length);

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id);

    // Em série, sempre. Paralelizar aqui é o oposto de respeitar o limite.
    for (const group of candidates) {
      try {
        const inviteUrl = await fetchInviteCode(remoteName, group.whatsapp_group_id);

        if (!inviteUrl) {
          // 200 sem convite utilizável: não vai melhorar sozinho.
          await markPermanentFailure(tenantId, group, "a Evolution respondeu sem um convite válido");
          continue;
        }

        const { error: updateError } = await supabase
          .from("groups")
          .update({ invite_url: inviteUrl })
          .eq("tenant_id", tenantId)
          .eq("id", group.id);

        if (updateError) {
          console.error(`[cron] group-invites: convite obtido mas não gravado (${group.id}):`, updateError.message);
          results.failed++;
          continue;
        }
        results.filled++;
      } catch (error) {
        if (!(error instanceof EvolutionError)) {
          console.error(`[cron] group-invites: erro inesperado em ${group.id}:`, error);
          results.failed++;
          continue;
        }

        // `detail`, não `message`: a message compõe path e status, e o reason
        // vai parar no painel do lojista — ninguém precisa ler a URL interna da
        // Evolution nem o JID do grupo pra decidir se tenta de novo.
        const failure = classifyInviteFailure({ status: error.status, detail: error.detail });

        if (failure.verdict === "transient") {
          // Não marca: a próxima execução tenta de novo.
          results.skipped++;
          continue;
        }

        await markPermanentFailure(tenantId, group, failure.reason);
      }
    }
  }

  // Sem isto, um deploy inerte (nenhuma sessão viva, env errada, tabela vazia)
  // responde `{ ok: true, filled: 0 }` — idêntico no log a um run saudável sem
  // nada na fila.
  if (processedInstances === 0) {
    console.warn(
      `[cron] group-invites: nenhuma instância conectada em ${byTenant.size} tenant(s) — nada a fazer neste run`,
    );
  }

  return Response.json({ ok: true, ...results, timestamp: now.toISOString() });
}
