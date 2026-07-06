const { registerHealthRoutes } = require("./health.js");
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.status(200).send("HUBFLOW Engine online");
});

registerHealthRoutes(app, () => ({
    whatsappConnected: Boolean(currentSocket?.user),
    supabaseWorker: supabaseCommandWorkerStarted,
    uptime: process.uptime(),
}));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Healthcheck ativo na porta ${PORT}`);
});

let useMultiFileAuthState;
let DisconnectReason;
let fetchLatestBaileysVersion;
let jidNormalizedUser;
let makeWASocket;

async function loadBaileys() {
  const baileys = await import("@whiskeysockets/baileys");
  ({ useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } = baileys);
  makeWASocket = baileys.default;
}

const qrcode = require("qrcode-terminal");
const pino = require("pino");

const { rm } = require("fs/promises");
const { readFileSync, writeFileSync, renameSync } = require("fs");

const { AntiBanQueue } = require("./anti-ban-queue.js");
const { WarmUp } = require("./warmup.js");
const { GroupOperationGuard, classifyGroupOpError } = require("./group-guard.js");
const { DeliveryTracker } = require("./delivery-tracker.js");
const {
  commitConfigSnapshot,
  commitConnectionSnapshot,
  prepareConfigSnapshot,
  prepareConnectionSnapshot,
  readOkJson,
} = require("./connection-snapshot.js");
const {
  bindConnectionLifecycle,
  createGracefulShutdown,
  createGroupSyncCoordinator,
  createLatestConfigRefresher,
  observePromise,
} = require("./connection-operations.js");
const { createConnectionWatchdogManager } = require("./connection-watchdog.js");
const { SessionAbortedError, createConnectionSessionController } = require("./connection-session.js");
const { createSupabaseCommandWorker } = require("./queues/supabase-command-worker.js");
const { validateEngineEnvironment } = require("./config/env.js");

const environment = validateEngineEnvironment();
if (!environment.valid) {
  throw new Error(`Configuração inválida da engine: ${environment.errors.join("; ")}`);
}

// Logger silencioso (Baileys é verboso). Suba para "info" se quiser depurar.
const logger = pino({ level: "silent" });


// Estado anti-ban PERSISTIDO — sem isto, um restart zera o contador do dia e o
// warmup acha que pode mandar tudo de novo (risco real de estourar o limite/ban).
const STATE_FILE = process.env.ENGINE_STATE_FILE ?? "engine-state.json";
function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
const persisted = loadState();

// Camadas anti-ban (controles seguros). WarmUp recupera fase/contador do dia.
const warmup = new WarmUp({ warmUpDays: 7, day1Limit: 20 }, persisted.warmup ?? null);
const guard = new GroupOperationGuard();
const delivery = new DeliveryTracker({
  onLowDeliveryRate: (r) => console.log(`🚨 Entrega baixa: ${(r * 100).toFixed(0)}% — possível soft-ban.`),
});

// Fila anti-ban — TODO envio passa por aqui (delays gaussianos + limites + warmup + backoff).
const queue = new AntiBanQueue({
  minDelayMs: 3000,
  maxDelayMs: 7000,
  maxPerMinute: 8,
  maxPerHour: 120,
  maxPerDay: 800,
  getDailyCap: () => warmup.getDailyLimit(), // warmup reduz o teto p/ número novo
  // Espalha a cota do número novo pelo dia (~8h ativas) — evita burst de bot.
  getMaxPerHour: () => {
    const cap = warmup.getDailyLimit();
    return Number.isFinite(cap) ? Math.max(6, Math.ceil(cap / 8)) : Infinity;
  },
  onSent: (result) => {
    warmup.record();
    delivery.onMessageSent(result?.key?.id);
  },
  onLog: (m) => console.log(m),
});

// Restaura as janelas de envio das últimas 24h — assim o restart NÃO libera uma
// nova cota diária inteira (a fila continua de onde parou).
if (Array.isArray(persisted.sent)) {
  const cutoff = Date.now() - 86_400_000;
  queue.sentTimestamps = persisted.sent.filter((t) => t > cutoff);
}

/**
 * Persiste warmup + janelas de envio (últimas 24h). Fail-silent.
 * Escrita ATÔMICA (tmp + rename): crash no meio da escrita não corrompe o JSON —
 * senão um arquivo truncado cai no catch de loadState e LIBERA cota nova (proibido).
 */
function saveState() {
  try {
    const cutoff = Date.now() - 86_400_000;
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify({ warmup: warmup.state, sent: queue.sentTimestamps.filter((t) => t > cutoff) }),
    );
    renameSync(tmp, STATE_FILE); // rename é atômico no mesmo volume
  } catch {
    // disco cheio / permissão — ignora
  }
}

// Salva ao sair para não perder o contador do dia / a fase do warmup.
// SIGINT = Ctrl+C; SIGTERM = pm2/systemd/docker stop (o caminho real em produção).
let shuttingDown = false;
const drainAndExit = createGracefulShutdown({
  shutdownController: () => connectionController.shutdown(),
  saveState,
  exit: (code) => process.exit(code),
  logger: console,
});
async function shutdown() {
  shuttingDown = true;
  return drainAndExit();
}
process.on("SIGINT", () => observePromise(shutdown(), console, "shutdown failed"));
process.on("SIGTERM", () => observePromise(shutdown(), console, "shutdown failed"));
// Última linha de defesa: salva o estado anti-ban antes de morrer por exceção não tratada.
process.on("uncaughtException", (err) => {
  console.error("Exceção não tratada:", err);
  saveState();
  process.exit(1);
});

// `mentions` pode ser um array OU uma função (thunk). Quando thunk, resolvemos
// DENTRO da task da fila — assim o groupMetadata do @todos só roda na vez da
// mensagem (serializado), em vez de disparar p/ todos os grupos em paralelo.
async function resolveMentions(mentions) {
  return typeof mentions === "function" ? await mentions() : mentions;
}

/** Envia texto SEMPRE pela fila anti-ban. Use priority p/ respostas imediatas. */
function sendText(sock, jid, text, { priority = false, mentions, session, assertActive } = {}) {
  return queue.enqueue(
    async () => {
      const m = await resolveMentions(mentions);
      assertActive?.();
      session?.assertActive();
      return sock.sendMessage(jid, { text, ...(m ? { mentions: m } : {}) });
    },
    { priority },
  );
}

/** Envia FOTO ou VÍDEO (buffer) com legenda pela fila anti-ban. */
function sendMedia(sock, jid, buffer, caption, mentions, kind, session) {
  const content =
    kind === "video"
      ? { video: buffer, caption: caption || undefined }
      : { image: buffer, caption: caption || undefined };
  return queue.enqueue(async () => {
    const m = await resolveMentions(mentions);
    session?.assertActive();
    return sock.sendMessage(jid, { ...content, ...(m ? { mentions: m } : {}) });
  });
}

/** JIDs de todos os participantes de um grupo (p/ "marcar todos"). [] se falhar. */
async function groupParticipantJids(sock, groupJid) {
  try {
    const md = await sock.groupMetadata(groupJid);
    return (md.participants ?? []).map((p) => p?.id).filter(Boolean);
  } catch {
    return [];
  }
}

/** Baixa os bytes de uma foto anexada à oferta (com token). null se falhar. */
async function fetchMedia(mediaId) {
  try {
    const res = await appFetch(`/api/media/${mediaId}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// URL do app que recebe os leads (Caminho A). Ajuste via env APP_URL.
const APP_URL = process.env.APP_URL;
// Token compartilhado com o app (deve bater com ENGINE_TOKEN do .env.local do app).
const ENGINE_TOKEN = process.env.ENGINE_TOKEN ?? "dz_dev_engine_token";
const ENGINE_TENANT_ID = process.env.ENGINE_TENANT_ID ?? "";

/** fetch ao app já com a base URL e o header de autenticação da engine. */
function appFetch(path, opts = {}) {
  return fetch(`${APP_URL}${path}`, {
    ...opts,
    headers: {
      "x-engine-token": ENGINE_TOKEN,
      "x-tenant-id": ENGINE_TENANT_ID,
      ...(opts.headers ?? {}),
    },
  });
}

let heartbeat = null; // intervalo que mantém o status "ao vivo" no painel
let dispatchTimer = null; // intervalo que puxa ofertas a disparar do app
let connectedSince = null; // quando a sessão atual abriu (p/ "conectado há X dias")
let reconnectAttempts = 0; // p/ backoff exponencial — zera ao conectar de fato
let currentSocket = null; // socket Baileys ativo, usado pelo worker Supabase
let currentSession = null;
const connectionController = createConnectionSessionController({
  reconnect: start,
  getRetryDelay: (error) => {
    console.error("Erro ao reconectar:", error);
    const wait = nextReconnectDelay();
    reconnectAttempts++;
    return wait;
  },
  logger: console,
});
const connectionWatchdog = createConnectionWatchdogManager({
  logger: console,
  recover: (session, error) => {
    const wait = nextReconnectDelay();
    reconnectAttempts++;
    return connectionController.recover(session, error, wait);
  },
});
let supabaseCommandWorkerStarted = false;
const supabaseCommandWorker = createSupabaseCommandWorker({
  getSession: () => currentSession?.state === "ready" && currentSession.isActive()
    ? currentSession
    : null,
  sendText,
  logger: console,
});

/** Atraso da próxima reconexão: backoff exponencial (3s→60s) + jitter. */
function nextReconnectDelay() {
  const base = Math.min(60_000, 3000 * 2 ** reconnectAttempts);
  return base + Math.floor(Math.random() * 1000); // jitter p/ não sincronizar tentativas
}

/**
 * Reporta o status da sessão ao painel + as stats que a engine JÁ calcula
 * (fila anti-ban, taxa de entrega, warm-up). Hoje elas só existem no terminal;
 * mandar no heartbeat destrava os cards de "número saudável"/densidade no app.
 * Fail-silent.
 */
async function reportSession(sock) {
  const id = sock.user?.id ?? "";
  let phone = null;
  try {
    phone = "+" + jidNormalizedUser(id).split("@")[0].split(":")[0];
  } catch {
    phone = null;
  }
  const profileName = sock.user?.name ?? sock.user?.verifiedName ?? "WhatsApp";
  const stats = {
    queue: queue.stats(), // pendentes + enviadas por min/hora/dia + pausada
    delivery: delivery.getStats(), // taxa de entrega (null se amostra pequena)
    warmup: warmup.status(), // fase/dia + limite e enviadas hoje (densidade)
  };
  try {
    await appFetch(`/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "connected", phone, profileName, connectedSince, stats }),
    });
  } catch {
    // app offline — ignora
  }
}

/**
 * Resolve o JID de um participante para o TELEFONE real (dígitos).
 * Baileys 7 entrega muitos participantes como LID (xxx@lid) — que NÃO é telefone.
 * Tenta mapear LID→PN; retorna null se ainda não conhecemos o número.
 */
async function resolvePhone(sock, jid) {
  if (!jid) return null;
  if (jid.endsWith("@s.whatsapp.net")) return toDigits(jid); // já é telefone
  if (jid.endsWith("@lid")) {
    try {
      const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
      return pn ? toDigits(pn) : null; // null = telefone ainda desconhecido
    } catch {
      return null;
    }
  }
  return toDigits(jid);
}

/** Reporta uma entrada no grupo como lead no app. phone=null → número oculto. Fail-silent. */
async function reportLead(phone, sourceGroup, sourceGroupId, session) {
  try {
    const res = await appFetch(`/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone ? `+${phone}` : "", sourceGroup, sourceGroupId }),
    });
    session?.assertActive();
    if (res.ok) console.log(`   ↳ lead registrado no app (${APP_URL}/leads)`);
    else console.log(`   ↳ app respondeu ${res.status} ao registrar lead`);
  } catch (error) {
    if (error instanceof SessionAbortedError) throw error;
    console.log(`   ↳ app offline — lead não registrado (${APP_URL})`);
  }
}

// === Boas-vindas automáticas (Sprint 2) ===
// Config, opt-out e grupos da conexão ativa. A referência só muda após revalidar o socket.
const connectionState = {
  welcomeCfg: { enabled: false, message: "" },
  optOutDigits: new Set(),
  adminGroupIds: new Set(),
  groupNames: new Map(),
  lastGroupsPayload: null,
  groupsSynced: false,
};
const welcomed = new Map(); // digits -> timestamp do envio (dedupe + poda diária)
const welcoming = new Set(); // dígitos com boas-vindas EM ANDAMENTO (evita corrida/duplo envio)

const onlyDigits = (s) => String(s).replace(/\D/g, "");

const fetchWelcome = () => appFetch(`/api/welcome`).then(readOkJson);
const fetchOptOut = () => appFetch(`/api/optout`).then(readOkJson);

const syncGroups = createGroupSyncCoordinator({
  state: connectionState,
  isLatest: (sock) => currentSession?.sock === sock && currentSession.isActive(),
  send: (payload, _options, signal) => appFetch(`/api/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  }),
  onResult: ({ response, payload, options }) => {
    if (options.quiet) return;
    if (response.ok) console.log(`   ↳ ${payload.groups.length} grupo(s) sincronizado(s) no painel (${APP_URL}/groups)`);
    else console.log(`   ↳ app respondeu ${response.status} ao sincronizar grupos`);
  },
  onError: ({ options }) => {
    if (!options.quiet) console.log(`   ↳ app offline — grupos não sincronizados (${APP_URL})`);
  },
});

const refreshLatestConfig = createLatestConfigRefresher({
  state: connectionState,
  isLatest: (sock) => currentSession?.sock === sock && currentSession.isActive(),
  prepare: () => prepareConfigSnapshot({
    fetchWelcome,
    fetchOptOut,
    onlyDigits,
    previousState: connectionState,
  }),
  commit: commitConfigSnapshot,
});

/** Busca config + opt-out sem publicar até confirmar que o socket ainda é o atual. */
async function refreshConfig(sock) {
  return refreshLatestConfig(sock);
}

/**
 * Manda a DM de boas-vindas para quem acabou de entrar — SE habilitado,
 * fora do opt-out e ainda não saudado. Vai pela fila anti-ban (lane prioritária).
 */
async function welcomeNewMember(sock, phone, session) {
  if (!connectionState.welcomeCfg.enabled || !connectionState.welcomeCfg.message.trim()) return;
  if (!phone) return; // sem telefone real resolvido (LID não mapeado) não dá p/ DM com segurança
  const digits = onlyDigits(phone);
  if (connectionState.optOutDigits.has(digits)) {
    console.log(`   ↳ boas-vindas puladas: +${digits} está no opt-out`);
    return;
  }
  if (welcomed.has(digits) || welcoming.has(digits)) return; // já saudado ou em andamento
  welcoming.add(digits);
  const jid = `${digits}@s.whatsapp.net`;
  const text = connectionState.welcomeCfg.message.replaceAll("{nome}", "tudo bem"); // sem nome real na entrada
  try {
    // Lane NORMAL (não prioritária): boas-vindas em lote não pode furar o ritmo
    // anti-ban — DM a quem nunca te escreveu já é o maior vetor de ban.
    await sendText(sock, jid, text, { session });
    session?.assertActive();
    welcomed.set(digits, Date.now()); // só marca DEPOIS do envio: falha transitória pode reenviar
    console.log(`   ↳ boas-vindas enviadas (via fila) para +${digits}`);
  } catch (err) {
    if (err instanceof SessionAbortedError) throw err;
    console.log(`   ↳ falha ao enviar boas-vindas para +${digits}: ${err.message}`);
  } finally {
    welcoming.delete(digits);
  }
}

/** Adiciona participantes a um grupo respeitando o GroupOperationGuard. */
async function addToGroup(sock, groupJid, participants) {
  const verdict = guard.check("add");
  if (!verdict.allowed) {
    console.log(`⛔ ${verdict.reason}. Tente em ${verdict.retryAfterSec}s.`);
    return { ok: false, reason: verdict.reason };
  }
  try {
    const res = await sock.groupParticipantsUpdate(groupJid, participants, "add");
    guard.record("add");
    return { ok: true, res };
  } catch (err) {
    const code = classifyGroupOpError(err);
    console.log(`⚠️  Falha no add ao grupo${code ? ` (${code})` : ""}: ${err.message}`);
    return { ok: false, code };
  }
}

/** Broadcast seguro: enfileira 1 mensagem por grupo (a fila cuida do ritmo). */
async function broadcast(sock, jids, text) {
  console.log(`\n📤 Enfileirando broadcast para ${jids.length} grupos (fila anti-ban no controle)...`);
  jids.forEach((jid) => sendText(sock, jid, text));
}

// === MOTOR DE DISPARO REAL (ofertas do app → grupos) ===
// A engine puxa as ofertas que o lojista mandou enviar e dispara pela fila
// anti-ban. O progresso é REAL: cada sendText resolve quando a mensagem sai.
let dispatching = false; // trava p/ não claimar a mesma fila em paralelo

/** Reporta progresso/resultado de um disparo ao app. Fail-silent. */
async function ackDispatch(id, status, sent, total, error) {
  try {
    await appFetch(`/api/dispatch/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, sent, total, error: error ?? null }),
    });
  } catch {
    // app offline — ignora
  }
}

/** Executa um disparo: 1 mensagem por grupo, com ack de progresso real. */
async function runDispatch(sock, job, session) {
  session.assertActive();
  // groupIds do app = JIDs (o sync usa o id do grupo). Vazio = todos os grupos ADMIN
  // (nunca dispara em grupo onde não somos admin).
  const jids = job.groupIds && job.groupIds.length ? job.groupIds : [...connectionState.adminGroupIds];
  const total = jids.length;
  if (total === 0) {
    console.log(`⛔ Disparo "${job.name}" sem grupos de destino.`);
    await ackDispatch(job.id, "failed", 0, 0, "Nenhum grupo de destino.");
    session.assertActive();
    return;
  }
  // Baixa a foto UMA vez (se a oferta tem mídia) e reusa em todos os grupos.
  let mediaBuf = null;
  if (job.mediaId) {
    mediaBuf = await fetchMedia(job.mediaId);
    session.assertActive();
    if (!mediaBuf) console.log(`   ⚠️ não consegui baixar a foto da oferta — envio só o texto.`);
  }
  const tipo = `${mediaBuf ? (job.mediaType === "video" ? "🎬 vídeo" : "📷 foto") : "texto"}${job.mentionAll ? " + @todos" : ""}`;
  console.log(`\n🚀 Disparo "${job.name}" (${tipo}) → ${total} grupo(s). Entrando na fila anti-ban...`);
  await ackDispatch(job.id, "running", 0, total);
  session.assertActive();

  const enviar = (jid) => {
    // "Marcar todos": menção invisível de todos os participantes. Passa como THUNK —
    // o groupMetadata só roda quando a fila pega a mensagem (não N em paralelo).
    const mentions = job.mentionAll ? () => groupParticipantJids(sock, jid) : undefined;
    // Enquete tem prioridade sobre texto/foto.
    if (job.poll?.question && Array.isArray(job.poll.options) && job.poll.options.length >= 2) {
      return queue.enqueue(async () => {
        const m = await resolveMentions(mentions);
        session.assertActive();
        return sock.sendMessage(jid, {
          poll: { name: job.poll.question, values: job.poll.options, selectableCount: 1 },
          ...(m ? { mentions: m } : {}),
        });
      });
    }
    return mediaBuf
      ? sendMedia(sock, jid, mediaBuf, job.message, mentions, job.mediaType, session)
      : sendText(sock, jid, job.message, { mentions, session });
  };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    jids.map((jid) =>
      enviar(jid)
        .then(() => {
          sent++;
        })
        .catch(() => {
          failed++;
        })
        .finally(() => session.isActive()
          ? ackDispatch(job.id, "running", sent, total)
          : undefined),
    ),
  );
  session.assertActive();

  const status = sent === 0 ? "failed" : "sent";
  const error = failed > 0 ? `${failed} de ${total} não enviadas` : null;
  console.log(`✅ Disparo "${job.name}" concluído: ${sent}/${total} enviadas${failed ? ` (${failed} falhas)` : ""}.`);
  await ackDispatch(job.id, status, sent, total, error);
  session.assertActive();
}

/** Reivindica ofertas enfileiradas no app e dispara cada uma. Fail-silent. */
async function pollDispatches(sock, session) {
  session.assertActive();
  if (dispatching) return;
  dispatching = true;
  try {
    let jobs = [];
    try {
      jobs = await appFetch(`/api/dispatch/pending`, { method: "POST" }).then((r) => r.json());
      session.assertActive();
    } catch {
      return; // app offline
    }
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    console.log(`\n📥 ${jobs.length} oferta(s) na fila de disparo.`);
    for (const job of jobs) {
      session.assertActive();
      await runDispatch(sock, job, session);
      session.assertActive();
    }
  } finally {
    dispatching = false;
  }
}

// === MOTOR DE AUTO-GROW (campanha lota → cria o próximo grupo) ===
// O app decide QUANDO criar (trigger proativo a 90%) e manda o job; a engine só
// EXECUTA: cria o grupo no WhatsApp, auto-configura e devolve o link de convite.
// Popula por LINK (não `add`) — link não dispara account_reachout_restricted.
let growing = false; // trava p/ não claimar a mesma fila de grow em paralelo

/** Reporta o resultado de uma criação de grupo ao app. Fail-silent. */
async function ackGrow(id, status, extra = {}) {
  try {
    await appFetch(`/api/groups/grow/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, ...extra }),
    });
  } catch {
    // app offline — ignora
  }
}

/** Cria + auto-configura UM grupo. Gateia em `create` no group-guard. */
async function runGrow(sock, job, session) {
  session.assertActive();
  // create é a operação mais sensível — respeita a janela do group-guard (2/10min).
  const verdict = guard.check("create");
  if (!verdict.allowed) {
    console.log(`⛔ Auto-grow "${job.campaignSlug}" adiado: ${verdict.reason}.`);
    // Não é erro permanente: devolve failed com o motivo p/ o app re-enfileirar depois.
    await ackGrow(job.id, "failed", { error: `group-guard: ${verdict.reason} (retry ${verdict.retryAfterSec}s)` });
    session.assertActive();
    return;
  }
  await ackGrow(job.id, "running");
  session.assertActive();
  let meta;
  try {
    // 1) Cria o grupo só com o dono (populamos por link de convite, não por add).
    meta = await sock.groupCreate(job.subject, []);
    session.assertActive();
    guard.record("create");
  } catch (err) {
    if (err instanceof SessionAbortedError) throw err;
    const code = classifyGroupOpError(err);
    console.log(`⚠️  Falha ao criar grupo "${job.subject}"${code ? ` (${code})` : ""}: ${err.message}`);
    await ackGrow(job.id, "failed", { error: `groupCreate: ${code ?? err.message}` });
    session.assertActive();
    return;
  }
  const jid = meta.id;
  console.log(`\n🆕 Grupo criado: "${job.subject}" (${jid}). Auto-configurando...`);

  // 2) Config best-effort: uma falha aqui não invalida o grupo (o que importa é o link).
  const step = async (label, fn) => {
    try {
      session.assertActive();
      await fn();
      session.assertActive();
    } catch (err) {
      if (err instanceof SessionAbortedError) throw err;
      console.log(`   ⚠️ auto-grow: ${label} falhou (ignorado): ${err.message}`);
    }
  };
  if (job.desc) await step("descrição", () => sock.groupUpdateDescription(jid, job.desc));
  if (job.announce !== false) await step('"só admin envia"', () => sock.groupSettingUpdate(jid, "announcement"));
  await step("modo de adição", () => sock.groupMemberAddMode(jid, job.memberAddMode || "admin_add"));
  if (job.mediaId) {
    const buf = await fetchMedia(job.mediaId);
    session.assertActive();
    if (buf) await step("foto", () => sock.updateProfilePicture(jid, buf));
  }

  // 3) Link de convite — é o que volta pro pool da campanha (/r/<campanha> roteia p/ cá).
  let inviteLink = null;
  try {
    const code = await sock.groupInviteCode(jid);
    session.assertActive();
    if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
  } catch (err) {
    if (err instanceof SessionAbortedError) throw err;
    console.log(`   ⚠️ auto-grow: não obtive o link de convite: ${err.message}`);
  }
  if (!inviteLink) {
    // Sem link, o grupo não serve ao pool — reporta failed p/ o app tentar de novo.
    await ackGrow(job.id, "failed", { whatsappGroupId: jid, error: "sem inviteLink (groupInviteCode falhou)" });
    session.assertActive();
    return;
  }

  // 4) Passamos a monitorar o grupo novo (somos admin) — captura de lead + boas-vindas.
  //    O próximo sync /api/groups já o inclui; o app preserva o inviteUrl do ack.
  connectionState.adminGroupIds.add(jid);
  connectionState.groupNames.set(jid, job.subject);

  await ackGrow(job.id, "created", { whatsappGroupId: jid, members: meta.size ?? 1, inviteLink });
  session.assertActive();
  console.log(`✅ Auto-grow "${job.campaignSlug}" concluído: ${job.subject} → ${inviteLink}`);
}

/** Reivindica jobs de criação de grupo e executa cada um. Fail-silent. */
async function pollGrow(sock, session) {
  session.assertActive();
  if (growing) return;
  growing = true;
  try {
    let jobs = [];
    try {
      jobs = await appFetch(`/api/groups/grow/pending`, { method: "POST" }).then((r) => r.json());
      session.assertActive();
    } catch {
      return; // app offline
    }
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    console.log(`\n🌱 ${jobs.length} grupo(s) a criar (auto-grow).`);
    for (const job of jobs) {
      session.assertActive();
      await runGrow(sock, job, session);
      session.assertActive();
    }
  } finally {
    growing = false;
  }
}

// Atividade por grupo (do dia): mensagens + remetentes únicos + última msg.
// Mede "grupo vivo que vende" vs "grupo lotado e morto". Guarda só CONTAGEM
// (não os números dos membros) — privacidade.
const groupActivity = new Map();

function recordActivity(groupId, senderJid) {
  const today = new Date().toISOString().slice(0, 10);
  let a = groupActivity.get(groupId);
  if (!a || a.date !== today) {
    a = { date: today, messages: 0, senders: new Set(), lastMessageAt: null };
    groupActivity.set(groupId, a);
  }
  a.messages++;
  const d = toDigits(senderJid);
  if (d) a.senders.add(d);
  a.lastMessageAt = new Date().toISOString();
}

/** Reporta a atividade dos grupos ao app (snapshot do dia). Fail-silent. */
async function reportActivity() {
  const groups = [];
  for (const [groupId, a] of groupActivity) {
    groups.push({
      whatsappGroupId: groupId,
      name: connectionState.groupNames.get(groupId) ?? groupId,
      date: a.date,
      messages: a.messages,
      activeMembers: a.senders.size,
      lastMessageAt: a.lastMessageAt,
    });
  }
  if (groups.length === 0) return;
  try {
    await appFetch(`/api/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    });
  } catch {
    // app offline — ignora
  }
}

/**
 * Poda estruturas em memória que só crescem (processo roda dias/semanas).
 * - welcomed: esquece quem foi saudado há >24h (reentrada no dia seguinte pode ser saudada).
 * - groupActivity: descarta snapshots de dias anteriores (já foram reportados ao app).
 */
function pruneMemory() {
  const cutoff = Date.now() - 86_400_000;
  for (const [d, ts] of welcomed) if (ts < cutoff) welcomed.delete(d);
  const today = new Date().toISOString().slice(0, 10);
  for (const [id, a] of groupActivity) if (a.date !== today) groupActivity.delete(id);
}

let cachedVersion = null; // versão do protocolo — busca 1x, reusa nas reconexões

async function start(signal = new AbortController().signal) {
  if (signal.aborted || shuttingDown) return;
  // Persiste a sessão na pasta ./auth — reconecta sem novo QR nas próximas vezes.
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  if (signal.aborted || shuttingDown) return;
  // A versão muda raramente; evita uma chamada de rede a cada reconexão.
  // Falha na busca (offline) cai no cache anterior, se houver.
  if (!cachedVersion) {
    try {
      ({ version: cachedVersion } = await fetchLatestBaileysVersion());
    } catch {
      // sem rede e sem cache: deixa o Baileys usar a versão embutida (version undefined)
    }
  }
  if (signal.aborted || shuttingDown) return;
  const version = cachedVersion ?? undefined; // undefined → Baileys usa a versão embutida
  console.log(`\n🚀 HUBFLOW Engine — Baileys (protocolo WhatsApp${version ? ` v${version.join(".")}` : ""})`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["HUBFLOW", "Chrome", "1.0.0"],
  });
  const session = connectionController.create(sock);
  let removeAuthOnClose = false;
  session.addFinalizer(() => removeAuthOnClose ? rm("auth", { recursive: true, force: true }) : undefined);
  currentSession = session;

  const on = (event, handler, { async = false, message = `${event} handler failed` } = {}) => {
    const guarded = async ? session.guardAsync(handler) : session.guard(handler);
    const listener = async
      ? (...args) => observePromise(guarded(...args), console, message)
      : guarded;
    sock.ev.on(event, listener);
    session.addCleanup(() => {
      const remove = sock.ev.off ?? sock.ev.removeListener;
      if (typeof remove === "function") remove.call(sock.ev, event, listener);
    });
  };
  session.addCleanup(() => {
    if (currentSocket === sock) currentSocket = null;
    if (currentSession === session) currentSession = null;
  });

  // Salva credenciais sempre que mudam (essencial para persistir a sessão).
  on("creds.update", saveCreds, { async: true, message: "credential persistence failed" });

  // Recibos de entrega (status 3 = entregue, 4 = lido) alimentam o DeliveryTracker.
  on("messages.update", (updates) => {
    if (session.state !== "ready") return;
    for (const { key, update } of updates) {
      session.assertActive();
      if (key?.fromMe && update?.status >= 3) delivery.onDeliveryReceipt(key.id);
    }
  });

  // Atividade dos grupos: conta mensagens de MEMBROS (não as minhas) nos grupos
  // admin. Alimenta "grupo vivo" e a etapa "Interagiram" do funil.
  on("messages.upsert", ({ messages = [], type }) => {
    if (session.state !== "ready") return;
    if (type !== "notify") return; // só mensagens novas
    for (const msg of messages) {
      session.assertActive();
      const jid = msg.key?.remoteJid ?? "";
      if (!jid.endsWith("@g.us") || msg.key?.fromMe) continue; // só grupos, não as minhas
      if (!connectionState.adminGroupIds.has(jid)) continue; // só grupos admin
      recordActivity(jid, msg.key?.participant);
    }
  });

  const initialization = {
      prepare: async () => {
        session.assertActive();
        const snapshot = await prepareConnectionSnapshot({
          sock,
          fetchWelcome,
          fetchOptOut,
          isAdminOf,
          myIds,
          onlyDigits,
          previousState: connectionState,
        });
        session.assertActive();
        return snapshot;
      },
      getRecoveryDelay: () => {
        const wait = nextReconnectDelay();
        reconnectAttempts++;
        return wait;
      },
      commit: (pendingSnapshot) => {
        session.assertActive();
        commitConnectionSnapshot(connectionState, pendingSnapshot);
        currentSocket = sock;
        connectionWatchdog.attach(session);
        session.addCleanup(() => connectionWatchdog.detach(session));
        console.log("\n✅ Conectado ao WhatsApp!");
        reconnectAttempts = 0;
        connectedSince = connectedSince ?? new Date().toISOString();
        logPreparedGroups(pendingSnapshot);
        const w = warmup.status();
        console.log(`🔥 Warm-up: ${w.phase} (dia ${w.day}/${w.totalDays}, limite hoje: ${w.todayLimit} msgs)`);

        const heartbeatHandle = setInterval(session.guard(() => {
          if (session.state !== "ready") return;
          observePromise(session.guardAsync(() => reportSession(sock))(), console, "session heartbeat failed");
          observePromise(session.guardAsync(() => refreshConfig(sock))(), console, "config refresh failed");
          observePromise(session.guardAsync(() => resyncGroupsIfNeeded(sock))(), console, "group resync failed");
          observePromise(session.guardAsync(() => reportActivity())(), console, "activity report failed");
          saveState();
          pruneMemory();
        }), 30_000);
        heartbeat = heartbeatHandle;
        session.addCleanup(() => {
          clearInterval(heartbeatHandle);
          if (heartbeat === heartbeatHandle) heartbeat = null;
        });

        const dispatchHandle = setInterval(session.guard(() => {
          if (session.state !== "ready") return;
          observePromise(session.guardAsync(() => pollDispatches(sock, session))(), console, "dispatch poll failed");
          observePromise(session.guardAsync(() => pollGrow(sock, session))(), console, "group growth poll failed");
        }), 10_000);
        dispatchTimer = dispatchHandle;
        session.addCleanup(() => {
          clearInterval(dispatchHandle);
          if (dispatchTimer === dispatchHandle) dispatchTimer = null;
        });

        supabaseCommandWorker.start(session.generation);
        supabaseCommandWorkerStarted = supabaseCommandWorker.getActiveGeneration() === session.generation;
        session.addCleanup(() => {
          if (supabaseCommandWorker.stop(session.generation)) {
            supabaseCommandWorkerStarted = false;
          }
        });

        const afterReady = (operation, message) => observePromise(
          Promise.resolve().then(session.guardAsync(operation)),
          console,
          message,
        );
        afterReady(() => reportSession(sock), "initial session report failed");
        afterReady(() => postGroups(sock, connectionState.lastGroupsPayload), "initial group sync failed");
        afterReady(() => pollDispatches(sock, session), "initial dispatch poll failed");
        afterReady(() => pollGrow(sock, session), "initial group growth poll failed");
      },
    };

  function getCloseDelay(lastDisconnect) {
    const code = lastDisconnect?.error?.output?.statusCode;
    const loggedOut = code === DisconnectReason.loggedOut;
    let wait;
    if (loggedOut) {
      // Logout/401: quase sempre QR expirado ou credencial velha. Limpa e gera QR novo.
      console.log("\n🔒 Sessão não autenticada (QR expirado ou auth velha). Limpando e gerando novo QR...");
      connectedSince = null; // sessão acabou de fato — zera o "conectado desde"
      removeAuthOnClose = true;
      wait = 2000;
    } else {
      wait = nextReconnectDelay();
      reconnectAttempts++;
      console.log(`\n⚠️  Conexão caiu (code ${code}). Reconectando em ${Math.round(wait / 1000)}s...`);
    }
    return wait;
  }

  bindConnectionLifecycle({
    sock,
    session,
    controller: connectionController,
    initialize: initialization,
    getCloseDelay,
    logger: console,
    onQr: (qr) => {
      console.log("\n📲 Abra o WhatsApp > Aparelhos conectados > Conectar aparelho");
      console.log("   e escaneie o QR Code abaixo:\n");
      qrcode.generate(qr, { small: true });
    },
  });

  // === O CORAÇÃO DO POC ===
  // Detecta quem ENTRA e quem SAI dos grupos — é o que fecha o loop clique -> entrada.
  on("group-participants.update", async (update) => {
    try {
      if (session.state !== "ready") return;
      const { id, participants = [], action } = update;

      // SÓ monitoramos grupos onde somos admin. Ignora todo o resto.
      if (!connectionState.adminGroupIds.has(id)) return;

      let name = connectionState.groupNames.get(id);
      if (!name) {
        try {
          name = (await sock.groupMetadata(id)).subject;
          session.assertActive();
          connectionState.groupNames.set(id, name);
        } catch (error) {
          if (error instanceof SessionAbortedError) throw error;
          name = id;
        }
      }
      for (const p of participants) {
        // Baileys 7: participante pode vir como string OU objeto, e como LID (não-telefone).
        const jid = typeof p === "string" ? p : (p?.id ?? p?.jid ?? "");
        if (!jid) continue;
        if (action === "add") {
          // Resolve o TELEFONE real (LID→PN). null = número ainda desconhecido.
          const phone = await resolvePhone(sock, jid);
          session.assertActive();
          console.log(`\n🟢 ENTRADA: ${phone ? `+${phone}` : "(número oculto)"} entrou em "${name}"`);
          await reportLead(phone, name, id, session); // grava o lead no app (Caminho A) — id = JID do grupo
          session.assertActive();
          await welcomeNewMember(sock, phone, session); // boas-vindas automáticas (Sprint 2)
          session.assertActive();
        } else if (action === "remove") {
          const phone = await resolvePhone(sock, jid);
          session.assertActive();
          console.log(`🔴 SAÍDA: ${phone ? `+${phone}` : "(número oculto)"} saiu de "${name}"`);
        }
      }
    } catch (err) {
      if (err instanceof SessionAbortedError) throw err;
      console.log(`⚠️  Erro ao processar evento de grupo (ignorado): ${err.message}`);
    }
  }, { async: true, message: "group participant handling failed" });
}

/** Só a parte numérica de um JID/LID (remove @dominio e :device). */
function toDigits(raw) {
  if (!raw) return "";
  try {
    return jidNormalizedUser(raw).split("@")[0].split(":")[0];
  } catch {
    return String(raw).split("@")[0].split(":")[0];
  }
}

/** Identificadores do número conectado (JID e LID), só a parte numérica. */
function myIds(sock) {
  const ids = new Set();
  for (const raw of [sock.user?.id, sock.user?.lid]) {
    const d = toDigits(raw);
    if (d) ids.add(d);
  }
  return ids;
}

/**
 * True se o número conectado é admin/superadmin do grupo. Usa MÚLTIPLOS sinais
 * (Baileys 7 com LID é inconsistente): dono do grupo + flags admin/isAdmin/
 * isSuperAdmin do participante que casa com o meu id/lid.
 */
function isAdminOf(group, mine) {
  // 1) Dono do grupo é admin por definição.
  for (const owner of [group.owner, group.ownerPn]) {
    if (owner && mine.has(toDigits(owner))) return true;
  }
  // 2) Participante "eu" marcado como admin.
  return (group.participants ?? []).some((p) => {
    const num = toDigits(p?.id ?? p?.jid);
    if (!num || !mine.has(num)) return false;
    return p.admin === "admin" || p.admin === "superadmin" || p.isAdmin === true || p.isSuperAdmin === true;
  });
}

function logPreparedGroups(snapshot) {
  const admin = snapshot.adminGroups;
  console.log(`\n📋 ${admin.length} grupo(s) onde VOCÊ é admin (de ${snapshot.groupNames.size} no total):`);
  for (const g of admin) console.log(`   • ${g.subject} — ${(g.participants ?? []).length} membros`);

  if (admin.length === 0 && snapshot.groupNames.size > 0) {
    console.log(
      "\n⚠️  Nenhum grupo admin detectado. NÃO vou monitorar entradas (evita lead de grupo alheio).\n" +
        "   Se você É admin de algum grupo, pode ser o formato LID do Baileys 7 — me avise para investigar.",
    );
  }

  console.log("\n👀 Monitorando entradas só nos grupos ADMIN, em tempo real... (Ctrl+C para sair)");

  // Exemplo de broadcast SEGURO (passa pela fila anti-ban) — descomente p/ testar:
  // const jids = admin.slice(0, 3).map((g) => g.id);
  // await broadcast(sock, jids, "Olá! Novidades chegando no grupo 👋");
}

/** POST /api/groups serializado por socket + identidade do payload. */
function postGroups(sock, payload, options = {}) {
  return syncGroups(sock, payload, options);
}

/**
 * Re-tenta o sync de grupos se o inicial falhou (app estava offline no connect).
 * Roda no heartbeat e para de tentar assim que sincroniza. Silencioso até dar certo.
 */
async function resyncGroupsIfNeeded(sock) {
  if (connectionState.groupsSynced || !connectionState.lastGroupsPayload) return;
  await postGroups(sock, connectionState.lastGroupsPayload, { quiet: true });
  if (connectionState.groupsSynced) console.log(`   ↳ grupos re-sincronizados no painel (app voltou ao ar).`);
}


async function bootstrap() {
  await loadBaileys();
  await start();
}

bootstrap().catch((error) => {
  console.error("Erro fatal ao iniciar a engine:", error);
  process.exit(1);
});
