import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { invalidarBioDaLoja } from "@/lib/bio/cache";
import { evolutionEventId } from "@/lib/evolution/event-id";
import { secretMatches } from "@/lib/evolution/webhook-secret";
import {
  mapConnectionState,
  parseEvolutionWebhook,
  phoneFromWuid,
  stripCredentials,
  type EvolutionWebhookEvent,
} from "@/lib/evolution/webhook-schema";
import { adminCountDelta, papelDoNossoNumero } from "@/lib/groups/admin-protection";
import { memberCountDelta } from "@/lib/groups/member-delta";
import { movimentoDeMembros, temSaidaVoluntaria } from "@/lib/groups/member-events";
import { gruposNovosDoUpsert } from "@/lib/groups/upsert-novos";
import { podeAplicarQr } from "@/lib/instance-qr-guard";
import { conferirNumeroDoAtendimento } from "@/lib/privado/numero";
import { matchesKeyword } from "@/lib/relampago/keyword";
import { parseUpsertMessage } from "@/lib/relampago/upsert-message";
import { resolveSecret } from "@/lib/runtime-secrets";
import { findOpenWindow, insertEntry } from "@/lib/stores/flash-offers";
import { recordGroupMemberEvents } from "@/lib/stores/group-member-events";
import { avaliarDisjuntorSaidas, iniciarConvalescenca } from "@/lib/stores/instance-health";
import {
  applyAdminCountDelta,
  applyMemberCountDelta,
  insertNewGroups,
  setGroupIsAdmin,
} from "@/lib/stores/groups";
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
    // Só grava código que veio: a entrega não é ordenada, e um QR do ciclo
    // anterior ao pedido (sem código) chegando atrasado apagaria o código
    // recém-gerado. Quem zera é a rota de ações, quando o lojista volta ao QR.
    ...(event.data.qrcode.pairingCode
      ? { metadata: { pairing_code: event.data.qrcode.pairingCode } }
      : {}),
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

/**
 * Códigos de queda em que o WhatsApp removeu a sessão: 401 (loggedOut) e 403
 * (forbidden). É o que a restrição por spam produz (23/10, 03/11 e 05/11/2026);
 * 428/408/515 são quedas passageiras que voltam sozinhas.
 */
const CODIGOS_DE_DERRUBADA: ReadonlySet<number> = new Set([401, 403]);

/**
 * Tempo entre o 401 e o `open` que separa uma derrubada de verdade do fluxo de
 * pareamento, que também emite 401 antes de abrir. Em prod (60 dias): pareamento
 * 0 a 15 min; derrubadas reais voltaram em 104 min a 3 dias.
 */
const DERRUBADA_MINUTOS_MINIMOS = 30;

function horaDaDerrubada(metadata: Record<string, unknown> | null | undefined): string | null {
  const v = metadata?.lastLoggedOutAt;
  return typeof v === "string" && Number.isFinite(new Date(v).getTime()) ? v : null;
}

async function applyConnectionUpdate(
  instance: Instance,
  event: EvolutionWebhookEvent,
  chegouEm: Date,
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

  // A HORA da derrubada (401/403) fica guardada até a sessão abrir de novo, para
  // a convalescença saber há quanto tempo o número caiu. Só o PRIMEIRO 401 do
  // episódio conta: o pareamento emite outro 401 segundos antes do `open`, e ele
  // apagaria a hora real (05/11/2026: 401 às 10:59, 401 às 13:46, open às 13:49).
  // `undefined` = não mexe na chave; o RPC mescla o metadata.
  const derrubadaEm = horaDaDerrubada(instance.metadata);
  let lastLoggedOutAt: string | null | undefined;
  if (
    status === "disconnected" &&
    event.data.statusReason != null &&
    CODIGOS_DE_DERRUBADA.has(event.data.statusReason) &&
    !derrubadaEm
  ) {
    lastLoggedOutAt = chegouEm.toISOString();
  }

  const phone = phoneFromWuid(event.data.wuid);

  if (status === "connected" && derrubadaEm) {
    // Antes de gravar "connected": se o banco falhar, a hora fica guardada e a
    // próxima abertura tenta de novo (connection.update open chega em rajada).
    const tratada = await iniciarConvalescencaSeDerrubado(instance, derrubadaEm, phone, chegouEm);
    lastLoggedOutAt = tratada ? null : derrubadaEm;
  }

  await updateInstanceStatus({
    tenantId: instance.tenant_id,
    instanceId: instance.id,
    status,
    phone,
    metadata: {
      lastDisconnectReason,
      ...(lastLoggedOutAt !== undefined ? { lastLoggedOutAt } : {}),
    },
  });

  // O link da bio esconde da página os links de WhatsApp que apontam para um número
  // da própria loja e guarda isso 5 min no cache. Número novo refaz a página na hora;
  // o mesmo número (ou nulo, queda sem wuid) não, porque o connection.update chega em
  // rajada e derrubaria o cache a cada evento.
  if (phone && phone !== instance.phone) invalidarBioDaLoja(instance.tenant_id);

  // Marco de ativação "conectou o WhatsApp". Só existia no heartbeat da engine
  // Baileys (`setSession`), que ninguém chama mais: com a Evolution o marco
  // nunca era gravado, e o cron mandava "conecte seu WhatsApp" para quem já
  // tinha conectado. `onlyFirst` guarda a data da primeira conexão — reconectar
  // não a move. Não lança: falha vira log em trackFunnelEvent. Só o número dos grupos: a loja que
  // pareou apenas o do atendimento não está ativada (distorceria o funil e calaria o Job 1).
  if (status === "connected") {
    if (instance.purpose === "grupos") {
      await trackFunnelEvent({ tenantId: instance.tenant_id, userId: null, event: "qr_connected", onlyFirst: true });
    }
    // Qualquer número da loja que abre sessão pode repetir o chip do outro: o dos grupos conectando
    // depois do atendimento derruba o do atendimento, e o inverso também. Por último de propósito: se o
    // banco falhar aqui, o 5xx faz a Evolution reentregar (o evento só é gravado depois) e a rodada
    // seguinte já não veria o telefone novo como novo — a invalidação da bio acima não pode ficar para trás.
    await conferirNumeroDoAtendimento(instance.tenant_id);
  }
}

/**
 * Convalescença (05/11/2026): o número que o WhatsApp derrubou e que voltou
 * horas ou dias depois fica 48 h sem postar e 14 dias em ritmo reduzido
 * (migração 20261105130000). Devolve `true` quando a hora da derrubada pode ser
 * esquecida (tratada ou irrelevante) e `false` quando o banco falhou — aí ela
 * fica guardada para a próxima abertura tentar de novo. Erro não derruba o
 * webhook: a sessão abriu de verdade, e o status precisa refletir isso.
 */
async function iniciarConvalescencaSeDerrubado(
  instance: Instance,
  derrubadaEm: string,
  phone: string | null,
  agora: Date,
): Promise<boolean> {
  const minutos = (agora.getTime() - new Date(derrubadaEm).getTime()) / 60_000;
  // Minutos entre o 401 e o open: é o pareamento, não uma derrubada.
  if (minutos < DERRUBADA_MINUTOS_MINIMOS) return true;
  // Chip diferente do que caiu: não é o número derrubado voltando, é outro
  // número na mesma vaga. A convalescença não é dele.
  if (phone && instance.phone && phone !== instance.phone) return true;
  try {
    const r = await iniciarConvalescenca(instance.tenant_id, instance.id, derrubadaEm);
    if (r.iniciada) {
      console.warn(
        `[webhook/evolution] convalescença iniciada para ${instance.id}: derrubado em ${derrubadaEm}, posts pausados até ${r.posts_pausados_ate}, ritmo reduzido até ${r.perfil_ate}, ${r.cancelados} envios cancelados`,
      );
    }
    return true;
  } catch (e) {
    console.error(`[webhook/evolution] convalescença não registrada para ${instance.id}:`, e);
    return false;
  }
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

  // O nosso número perdeu (ou recuperou) a administração: `is_admin` decide se
  // o grupo é alvo de disparo e de captura de lead, e antes só o Sincronizar
  // manual o mudava. Vem antes da saída abaixo porque o `remove` do nosso
  // número chega sem o flag de admin no payload.
  // ponytail: só o número que recebeu o webhook (`groups` não tem instance_id);
  // com 2 números no mesmo grupo, rebaixar um marca false mesmo com o outro admin.
  const papel = papelDoNossoNumero(event.data.action, event.data.participants, instance.phone);
  if (papel) {
    try {
      await setGroupIsAdmin(instance.tenant_id, event.data.id, papel === "ganhou");
    } catch (e) {
      console.error(`[webhook/evolution] is_admin não gravado para o grupo ${event.data.id}:`, e);
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
 * Grupo criado (ou em que o número entrou) depois da conexão entra sozinho.
 *
 * Só insere: grupo que já existe fica com o sync. Por isso roda em toda
 * entrega, não só na primeira — a reentrega é no-op no banco, e se a primeira
 * tentativa falhou ela é a segunda chance. Erro não derruba a resposta: o
 * próximo sync importa o grupo do mesmo jeito.
 */
async function applyNewGroups(instance: Instance, event: EvolutionWebhookEvent): Promise<void> {
  if (event.event !== "groups.upsert") return;
  try {
    const ourPhones = (await listInstances(instance.tenant_id)).map((i) => i.phone);
    const rows = gruposNovosDoUpsert(event.data, instance.phone, ourPhones, new Date().toISOString());
    await insertNewGroups(instance.tenant_id, rows);
  } catch (e) {
    console.error(`[webhook/evolution] grupo novo não gravado:`, e);
  }
}

/**
 * Entrada e saída de verdade (painel D, PR D): cada pessoa de um `add` ou
 * `remove` vira uma linha em `group_member_events`, fonte de "Entraram" e
 * "Saíram" na campanha. Mesmo contrato dos deltas: só na primeira entrega, e
 * erro não derruba a resposta, porque a reentrega que o 500 provocaria já não
 * seria nova.
 */
async function recordMemberEvents(instance: Instance, event: EvolutionWebhookEvent, chegouEm: Date): Promise<void> {
  if (event.event !== "group-participants.update") return;
  const movimento = movimentoDeMembros(event.data.action, event.data.participants, chegouEm);
  if (!movimento) return;
  try {
    await recordGroupMemberEvents(instance.tenant_id, event.data.id, movimento);
  } catch (e) {
    console.error(`[webhook/evolution] entrada/saída não gravada para o grupo ${event.data.id}:`, e);
  }
}

/**
 * Disjuntor do anti-ban (incidente de 23/10/2026): cada saída voluntária faz o
 * banco recontar as saídas das últimas 3 h e, passando do limite, pausar os
 * posts da loja. Mesmo contrato dos deltas: só na primeira entrega, e erro não
 * derruba a resposta.
 */
async function checkExitBreaker(instance: Instance, event: EvolutionWebhookEvent): Promise<void> {
  if (event.event !== "group-participants.update") return;
  if (!temSaidaVoluntaria(event.data.action, event.data.participants, event.data.author)) return;
  try {
    const r = await avaliarDisjuntorSaidas(instance.tenant_id);
    if (r.novo) {
      console.warn(
        `[webhook/evolution] disjuntor de saídas aberto para ${instance.tenant_id}: ${r.saidas} saídas em 3 h (limite ${r.limite}), ${r.cancelados} envios cancelados, pausa até ${r.ate}`,
      );
    }
  } catch (e) {
    console.error(`[webhook/evolution] disjuntor de saídas não avaliado para ${instance.tenant_id}:`, e);
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

  // Erro de banco aqui (e no findOpenWindow acima) sobe e vira 500, como o da
  // instância: 200 diria à Evolution que o comentário foi gravado. Reentregar é
  // seguro — o índice único da mensagem transforma a repetição em no-op.
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

  return true;
}

export async function POST(req: Request) {
  // Antes de qualquer await: é a hora do fato (o date_time da Evolution não serve).
  const chegouEm = new Date();
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

  // O número do atendimento nunca entra na sincronização de grupos (spec §3): evento de grupo dele não
  // importa grupo, não mexe em contagem nem no disjuntor, não vira lead e não fica gravado.
  if (
    instance.purpose === "privado" &&
    (event.event === "groups.upsert" || event.event === "group-participants.update")
  ) {
    return Response.json({ received: true, ignored: true });
  }

  if (event.event === "qrcode.updated") {
    await applyQrCode(instance, event);
    return Response.json({ received: true });
  }

  if (event.event === "connection.update") {
    await applyConnectionUpdate(instance, event, chegouEm);
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
    await recordMemberEvents(instance, event, chegouEm);
    await checkExitBreaker(instance, event);
  }
  await applyNewGroups(instance, event);

  return Response.json({ received: true });
}
