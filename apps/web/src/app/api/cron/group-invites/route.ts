import { isCronAuthorized } from "@/lib/cron-auth";
import { EvolutionError, fetchInviteCode, providerInstanceId } from "@/lib/evolution/client";
import {
  buildInviteFetchMarker,
  classifyInviteFailure,
  rotateByDay,
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
 * foi gravado persiste, a próxima execução diária continua a fila), só atrasa
 * o backfill — mas não há motivo pra pagar esse atraso de graça.
 */
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Quantos convites buscar por instância em CADA execução.
 *
 * Este número junto com a cadência do cron (diária, `0 6 * * *` em
 * vercel.json — o plano Hobby da Vercel só libera cron uma vez por dia, então
 * o antigo agendamento de 10 em 10 minutos era rejeitado no deploy) É o rate
 * limiter: até 10 convites por instância por dia. Isso é MAIS conservador que
 * o teto do bucket `invite` do group-guard da engine (10/10min) — o mesmo
 * volume de 10 chamadas agora espalhado num dia inteiro em vez de 10 minutos,
 * não o contrário. Não existe bucket em memória aqui de propósito — o
 * agendador é durável, um processo que morre no meio não libera rajada no
 * próximo boot.
 *
 * O limite é POR INSTÂNCIA porque o teto do WhatsApp é por conta, e cada tenant
 * tem o seu número.
 *
 * Mexer aqui sem mexer no `schedule` do vercel.json quebra a política.
 */
const MAX_PER_INSTANCE_PER_RUN = 10;

/**
 * Quantas falhas permanentes NÃO reconhecidas seguidas, sem nenhum convite
 * preenchido no run, bastam pra concluir que o problema é da instância.
 *
 * A Evolution 2.3.7 achata toda falha de grupo num 404 igual: instância
 * recriada, dessincronizada ou com o socket caído entre o heartbeat e a chamada
 * devolve exatamente o mesmo erro de um grupo que perdeu admin. Sem este freio,
 * um tropeço da instância marcaria a fila inteira como definitiva — 10 por
 * execução, calado, e o resgate é um PATCH manual POR GRUPO.
 *
 * 3 é o suficiente pra não confundir com azar (dois ou três grupos ruins em
 * seguida acontece) e baixo o bastante pra parar antes do estrago.
 */
const UNRECOGNIZED_FAILURE_STREAK_LIMIT = 3;

/**
 * Teto explícito de linhas de `instances` lidas por execução.
 *
 * Sem `order` + `limit`, o corte de linhas do PostgREST é arbitrário: um tenant
 * poderia chegar aqui só com as linhas velhas e ser pulado como se não tivesse
 * sessão viva. Mais recentes primeiro, com folga de sobra pra base atual.
 */
const MAX_INSTANCE_ROWS = 1000;

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
 * Falha definitiva RECONHECIDA (perdi admin, grupo travado, convite revogado)
 * grava `metadata.inviteFetch` e tira o grupo da fila para sempre: o cron não
 * pode bater eternamente num grupo impossível. O resgate é manual, pela rota
 * PATCH (ver Task 5) — nunca automático.
 *
 * Falha definitiva NÃO reconhecida (o 404 genérico da Evolution) só marca depois
 * que a instância provou que responde neste run. Ver
 * `UNRECOGNIZED_FAILURE_STREAK_LIMIT`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req.headers.get("authorization"), CRON_SECRET)) {
    // Sem este log, um CRON_SECRET ausente, curto demais (`isCronAuthorized`
    // exige 24+) ou fora de sincronia com o vercel.json devolve 401 todo dia e
    // no log fica idêntico a um run saudável — o aviso de run inerte lá embaixo
    // nem chega a rodar. Só a classe do problema vai pro log: o segredo (ou
    // pedaço dele) nunca.
    console.warn(
      `[cron] group-invites: chamada não autorizada — CRON_SECRET ${
        CRON_SECRET.length >= 24 ? "configurado, header não confere" : "ausente ou curto demais"
      }`,
    );
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
      // nele todo dia, exatamente o que a marcação existe pra evitar.
      console.error(`[cron] group-invites: falha marcando ${group.id} como definitivo:`, markError.message);
    }
    results.failed++;
  };

  const { data: instanceRows, error: instancesError } = await supabase
    .from("instances")
    .select("id, tenant_id, provider_instance_id, status, updated_at")
    // Ordem determinística + teto: ver MAX_INSTANCE_ROWS.
    .order("updated_at", { ascending: false })
    .limit(MAX_INSTANCE_ROWS);

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

  // Em escala (dezenas de tenants, dezenas de grupos cada) o loop serial pode
  // não caber no maxDuration e o run é cortado no meio. Como a leitura de
  // `instances` vem sempre na mesma ordem, sem rotação os tenants no fim da
  // lista seriam cortados TODA execução — starvation permanente e silenciosa.
  // Girar por dia faz um tenant diferente liderar a cada run: em N dias, com N
  // tenants, todo mundo já foi o primeiro da fila pelo menos uma vez.
  const rotatedTenants = rotateByDay([...byTenant.entries()], now);

  for (const [tenantId, rows] of rotatedTenants) {
    const instance = selectSessionRow(rows);
    // `isConnectedStatus` em vez de `status === "connected"` na unha: é o helper
    // canônico compartilhado com o painel, então "sessão viva" quer dizer aqui
    // exatamente o que quer dizer na tela do lojista.
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

    // Prova de que a instância responde: enquanto for 0, uma falha permanente
    // não reconhecida pode ser tanto do grupo quanto da instância inteira, e
    // marcar seria apostar a fila do lojista no palpite.
    let filledForTenant = 0;
    let unrecognizedStreak = 0;
    let attemptedCount = 0;

    // Em série, sempre. Paralelizar aqui é o oposto de respeitar o limite.
    for (const group of candidates) {
      attemptedCount++;
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
        filledForTenant++;
        unrecognizedStreak = 0;
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

        // Falha reconhecida (403/forbidden, travado, revogado) é comprovadamente
        // deste grupo. Não reconhecida só vira definitiva depois que a instância
        // provou que responde — pelo menos um convite preenchido neste run.
        if (failure.recognized || filledForTenant > 0) {
          await markPermanentFailure(tenantId, group, failure.reason);
          continue;
        }

        // Sem prova de instância viva: deixa o grupo na fila e tenta na próxima.
        results.skipped++;
        unrecognizedStreak++;

        if (unrecognizedStreak >= UNRECOGNIZED_FAILURE_STREAK_LIMIT) {
          console.error(
            `[cron] group-invites: ${unrecognizedStreak} falhas seguidas sem convite algum no tenant ${tenantId} — tratando como problema da instância, não dos grupos. Último motivo: ${failure.reason}`,
          );
          // Grupos não tentados entram na fila novamente — o breaker protege só
          // contra abusos de sistema inteiro, não contra filas incompletas.
          results.remaining += candidates.length - attemptedCount;
          break;
        }
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
  } else if (results.filled === 0 && (results.failed > 0 || results.skipped > 0)) {
    // Instância viva, fila com grupos e nenhum convite: o aviso acima não pega
    // este caso e ele é justamente o do estrago silencioso (instância fora do
    // ar respondendo 404 pra tudo).
    console.warn(
      `[cron] group-invites: ${processedInstances} instância(s) processada(s) e nenhum convite preenchido — failed=${results.failed}, skipped=${results.skipped}, remaining=${results.remaining}`,
    );
  }

  return Response.json({ ok: true, ...results, timestamp: now.toISOString() });
}
