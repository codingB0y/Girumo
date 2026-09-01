import { evolutionEventId } from "@/lib/evolution/event-id";
import { secretMatches } from "@/lib/evolution/webhook-secret";
import {
  mapConnectionState,
  parseEvolutionWebhook,
  phoneFromWuid,
  stripCredentials,
  type EvolutionWebhookEvent,
} from "@/lib/evolution/webhook-schema";
import { adminCountDelta } from "@/lib/groups/admin-protection";
import { memberCountDelta } from "@/lib/groups/member-delta";
import { podeAplicarQr } from "@/lib/instance-qr-guard";
import { matchesKeyword } from "@/lib/relampago/keyword";
import { parseUpsertMessage } from "@/lib/relampago/upsert-message";
import { resolveSecret } from "@/lib/runtime-secrets";
import { findOpenWindow, insertEntry } from "@/lib/stores/flash-offers";
import { applyAdminCountDelta, applyMemberCountDelta } from "@/lib/stores/groups";
import {
  findByProviderInstanceId,
  listInstances,
  recordEngineEvent,
  updateInstanceStatus,
  type Instance,
} from "@/lib/stores/instances";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Receiver dos webhooks da Evolution API.
 *
 * Ordem deliberada: autentica → valida → resolve instância → só então escreve.
 * Nada acontece antes do secret conferir, para que um atacante não consiga usar
 * o endpoint nem como oráculo (descobrir instâncias) nem como gerador de carga
 * no banco.
 *
 * Idempotência não é tratada aqui: o `event_id` determinístico + o UNIQUE em
 * `engine_events` fazem a reentrega virar no-op no próprio Postgres.
 */

// nodejs (não edge): timingSafeEqual é do módulo crypto do Node.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET_HEADER = "x-evolution-webhook-secret";

/** QR: só o status/código na instância. O código NUNCA entra em engine_events. */
async function applyQrCode(instance: Instance, event: EvolutionWebhookEvent): Promise<void> {
  if (event.event !== "qrcode.updated") return;

  // A Evolution emite QR em rajada e a entrega nao e ordenada: o codigo que
  // estava em voo quando o celular pareou chega DEPOIS do `connection.update`
  // com `open`. Grava-lo rebaixava a sessao viva de volta para `qr`, e a tela
  // voltava a pedir leitura de um numero que ja estava conectado.
  if (!podeAplicarQr(instance.status)) return;

  await updateInstanceStatus({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    status: "qr",
    qrCode: event.data.qrcode.code,
  });

  // Observabilidade sem credencial: registra que houve QR, nunca qual.
  await getSupabaseAdmin().from("logs").insert({
    tenant_id: instance.tenant_id,
    level: "info",
    event: "evolution.qr.updated",
    message: "Novo QR de pareamento emitido.",
    metadata: { instance_id: instance.id },
  });
}

async function applyConnectionUpdate(
  instance: Instance,
  event: EvolutionWebhookEvent,
): Promise<void> {
  if (event.event !== "connection.update") return;

  const status = mapConnectionState(event.data.state);
  // Estado desconhecido (versão futura): o evento fica registrado, mas o status
  // da instância não é adivinhado.
  if (!status) return;

  // O MOTIVO da queda decide o que o lojista precisa fazer, e jogá-lo fora
  // torna `401` (sessão removida — só volta pareando de novo) indistinguível de
  // `428` (queda passageira, volta sozinha). A tela dizia "desconectado" nos
  // dois casos. Vai em `metadata` porque o RPC mescla (`metadata || target`),
  // então não precisa de coluna nova nem migração nos dois bancos.
  const lastDisconnectReason =
    status === "disconnected" ? (event.data.statusReason ?? null) : null;

  await updateInstanceStatus({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    status,
    phone: phoneFromWuid(event.data.wuid),
    metadata: { lastDisconnectReason },
  });
}

/**
 * Mantém vivas as duas contagens do grupo: quantos membros tem e quantos
 * administradores (proteção do ativo, R1).
 *
 * Sem isto, saber se um grupo depende de um único admin exigiria refazer o
 * `fetchAllGroups` — que busca a foto de perfil de CADA grupo em série e leva
 * dezenas de segundos. O webhook entrega a mudança de graça, no instante em que
 * ela acontece.
 *
 * Erro aqui não derruba a resposta de propósito: devolver 500 faria a Evolution
 * reentregar, e na reentrega `isNew` seria falso — o delta não seria aplicado
 * de qualquer jeito. Fica o log, e o próximo sync recalibra a contagem.
 */
async function applyGroupDeltas(instance: Instance, event: EvolutionWebhookEvent): Promise<void> {
  if (event.event !== "group-participants.update") return;

  // A contagem de MEMBROS vem antes porque `add` — o evento mais frequente do
  // produto, gente entrando no grupo VIP — não mexe em admin nenhum e era
  // descartado logo abaixo. Era por isso que o número de membros só andava
  // quando alguém clicava em sincronizar.
  const deltaMembros = memberCountDelta(event.data.action, event.data.participants);
  if (deltaMembros !== 0) {
    try {
      await applyMemberCountDelta(instance.tenant_id, event.data.id, deltaMembros);
    } catch (e) {
      // Mesmo contrato do delta de admin: não derruba a resposta. Devolver 500
      // faria a Evolution reentregar o evento, e a reentrega somaria de novo —
      // inflando justamente o número que se queria corrigir.
      console.error(
        `[webhook/evolution] delta de membros falhou para o grupo ${event.data.id}:`,
        e,
      );
    }
  }

  // Daqui pra baixo é só contagem de admin. Sem dono ainda: a decisão de
  // ignorar depende só da ação e do papel do participante, e sair aqui evita
  // uma leitura de instâncias por entrada de cliente.
  if (adminCountDelta(event.data.action, event.data.participants, []).total === 0) return;

  try {
    // Só agora vale pagar a leitura: "nosso" é qualquer número do tenant, não
    // apenas o que recebeu o webhook.
    const ourPhones = (await listInstances(instance.tenant_id)).map((i) => i.phone);
    const delta = adminCountDelta(event.data.action, event.data.participants, ourPhones);
    await applyAdminCountDelta(instance.tenant_id, event.data.id, delta);
  } catch (e) {
    console.error(
      `[webhook/evolution] delta de admins falhou para o grupo ${event.data.id}:`,
      e,
    );
  }
}

/**
 * Oferta Relâmpago: captura o comentário que casa uma janela aberta.
 *
 * Descarte do mais barato para o mais caro. Ligar `messages.upsert` faz chegar
 * TODA mensagem de TODOS os grupos onde a instância está; nada disso pode virar
 * linha, porque é dado pessoal de gente que não é cliente de ninguém. Só o que
 * passa pelos seis degraus persiste.
 *
 * Devolve `true` quando tratou o evento — o chamador então NÃO grava em
 * engine_events, que encheria de mensagem de terceiro.
 */
async function applyFlashOfferComment(
  instance: Instance,
  event: EvolutionWebhookEvent,
): Promise<boolean> {
  if (event.event !== "messages.upsert") return false;

  // 1. conversa privada nunca é capturada
  if (!event.data.key.remoteJid.endsWith("@g.us")) return true;
  // 2. mensagem nossa
  if (event.data.key.fromMe) return true;

  // 3. sem texto (mídia, áudio, figurinha)
  const msg = parseUpsertMessage(event.data);
  if (!msg) return true;

  // 4. sem janela aberta neste grupo
  const janela = await findOpenWindow(instance.tenant_id, msg.remoteJid);
  if (!janela) return true;

  // 5. não casa a palavra-chave
  if (!matchesKeyword(msg.text, janela.keyword)) return true;

  // 6. anterior à abertura da janela. A entrega da Evolution não é ordenada:
  // sem isto, um evento atrasado da oferta ANTERIOR cairia na fila da atual —
  // literalmente a divergência que a feature existe para evitar.
  if (msg.commentedAt < new Date(janela.openedAt)) return true;

  try {
    await insertEntry({
      tenantId: instance.tenant_id,
      offerId: janela.offerId,
      groupId: janela.groupId,
      whatsappGroupId: msg.remoteJid,
      participantJid: msg.participantJid,
      phone: msg.phoneHint ?? janela.lidMap[msg.participantJid] ?? null,
      pushName: msg.pushName,
      messageText: msg.text,
      messageId: msg.messageId,
      commentedAt: msg.commentedAt,
    });
  } catch (e) {
    // Não derruba a resposta: 500 faria a Evolution reentregar, e a reentrega
    // cairia no mesmo erro. Fica o log.
    console.error(`[webhook/evolution] captura da oferta relampago falhou:`, e);
  }

  return true;
}

export async function POST(req: Request) {
  const expectedSecret = resolveSecret(
    "EVOLUTION_WEBHOOK_SECRET",
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.NODE_ENV,
    "dev-evolution-webhook-secret",
  );

  if (!secretMatches(req.headers.get(SECRET_HEADER), expectedSecret)) {
    // 401 sem corpo descritivo e sem nenhum side effect.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseEvolutionWebhook(raw);
  if (!parsed.ok) {
    // `parsed.error` é só caminho + motivo, nunca o payload (contém apikey).
    return Response.json({ error: "invalid payload", detail: parsed.error }, { status: 400 });
  }

  const event = parsed.event;

  const instance = await findByProviderInstanceId(event.instance);
  if (!instance) {
    // 202, não 404: responder diferente por instância existente/inexistente
    // transformaria o endpoint num oráculo de enumeração. A Evolution também
    // não deve reentregar um evento que nunca teremos como associar.
    return Response.json({ received: true, ignored: true }, { status: 202 });
  }

  if (event.event === "qrcode.updated") {
    await applyQrCode(instance, event);
    return Response.json({ received: true });
  }

  if (event.event === "connection.update") {
    await applyConnectionUpdate(instance, event);
  }

  // Mensagem de grupo não entra em engine_events: são dezenas de milhares de
  // mensagens de terceiros por semana e nenhuma delas nos pertence.
  if (await applyFlashOfferComment(instance, event)) {
    return Response.json({ received: true });
  }

  // Demais eventos (e connection.update, que também vira trilha) vão para a
  // fila de eventos, consumida pelo worker nas F3/F4.
  //
  // Persiste o payload CRU menos a credencial, não o objeto do zod: o schema
  // descarta chaves de topo desconhecidas, e é exatamente essa diferença que
  // documentaria uma mudança de contrato entre versões da Evolution.
  const recorded = await recordEngineEvent({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    type: event.event,
    payload: stripCredentials(raw as Record<string, unknown>),
    eventId: evolutionEventId(event),
  });

  // Só DEPOIS de gravar, e só na primeira entrega: o delta é relativo, então
  // uma reentrega o somaria de novo.
  if (recorded.isNew) {
    await applyGroupDeltas(instance, event);
  }

  return Response.json({ received: true });
}
