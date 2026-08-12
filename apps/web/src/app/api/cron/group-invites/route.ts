import { isCronAuthorized } from "@/lib/cron-auth";
import { EvolutionError, fetchInviteCode, providerInstanceId } from "@/lib/evolution/client";
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "@/lib/groups/invite-backfill";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { data: instances, error: instancesError } = await supabase
    .from("instances")
    .select("id, tenant_id, provider_instance_id, status")
    .eq("status", "connected");

  if (instancesError) {
    console.error("[cron] group-invites: falha lendo instances:", instancesError.message);
    return Response.json({ error: "instances unavailable" }, { status: 500 });
  }

  for (const instance of instances ?? []) {
    const tenantId = instance.tenant_id as string | null;
    if (!tenantId) continue;

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

    const remoteName = instance.provider_instance_id || providerInstanceId(instance.id as string);

    // Em série, sempre. Paralelizar aqui é o oposto de respeitar o limite.
    for (const group of candidates) {
      try {
        const inviteUrl = await fetchInviteCode(remoteName, group.whatsapp_group_id);

        if (!inviteUrl) {
          // 200 sem convite utilizável: não vai melhorar sozinho.
          const marker = buildInviteFetchMarker("a Evolution respondeu sem um convite válido", now);
          await supabase
            .from("groups")
            .update({ metadata: { ...(group.metadata ?? {}), inviteFetch: marker } })
            .eq("tenant_id", tenantId)
            .eq("id", group.id);
          results.failed++;
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

        // `EvolutionError` só expõe status e path; o detail vive dentro da
        // message composta, então é ela que vai para a classificação.
        const failure = classifyInviteFailure({ status: error.status, detail: error.message });

        if (failure.verdict === "transient") {
          // Não marca: a próxima execução tenta de novo.
          results.skipped++;
          continue;
        }

        const marker = buildInviteFetchMarker(failure.reason, now);
        await supabase
          .from("groups")
          .update({ metadata: { ...(group.metadata ?? {}), inviteFetch: marker } })
          .eq("tenant_id", tenantId)
          .eq("id", group.id);
        results.failed++;
      }
    }
  }

  return Response.json({ ok: true, ...results, timestamp: now.toISOString() });
}
