
const express = require("express");
const app = express();

function healthPayload() {
  const whatsappConnected = Boolean(currentSocket?.user);
  const supabaseReady = !environment.requiresSupabase || supabaseCommandWorkerStarted;
  const ready = whatsappConnected && supabaseReady;
  return {
    ok: ready,
    // Status legível pra healthcheck externo (Coolify usa /health; ver deploy/coolify).
    status: ready ? "ok" : "degraded",
    connected: whatsappConnected,
    // Última transição de conexão observada (connection.update). null até o 1º evento.
    lastEventAt: lastConnectionEventAt,
    service: "hubflow-engine",
    whatsappConnected,
    supabaseWorker: supabaseCommandWorkerStarted,
    uptime: process.uptime(),
  };
}

app.get("/", (req, res) => {
  res.status(200).send("HUBFLOW Engine online");
});

app.get("/live", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "hubflow-engine",
    uptime: process.uptime(),
  });
});

app.get("/ready", (req, res) => {
  const payload = healthPayload();
  res.status(payload.ok ? 200 : 503).json(payload);
});

app.get("/health", (req, res) => {
  const payload = healthPayload();
  res.status(payload.ok ? 200 : 503).json(payload);
});

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
const { ConnectionWatchdog } = require("./connection-watchdog.js");
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
function shutdown() {
  if (shuttingDown) return; // evita salvar 2x se os dois sinais chegarem
  shuttingDown = true;
  watchdog?.stop();
  supabaseCommandWorker.stop();
  saveState();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
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
function sendText(sock, jid, text, { priority = false, mentions } = {}) {
  return queue.enqueue(
    async () => {
      const m = await resolveMentions(mentions);
      return sock.sendMessage(jid, { text, ...(m ? { mentions: m } : {}) });
    },
    { priority },
  );
}

/** Envia FOTO ou VÍDEO (buffer) com legenda pela fila anti-ban. */
function sendMedia(sock, jid, buffer, caption, mentions, kind) {
  const content =
    kind === "video"
      ? { video: buffer, caption: caption || undefined }
      : { image: buffer, caption: caption || undefined };
  return queue.enqueue(async () => {
    const m = await resolveMentions(mentions);
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
let lastConnectionEventAt = null; // ISO da última transição connection.update (health)
let watchdog = null; // ConnectionWatchdog do socket atual (detecta stream zumbi)
let reconnecting = false; // trava: no máx. 1 reconexão em voo (2 sockets do mesmo nº = ban)
let supabaseCommandWorkerStarted = false;
const supabaseCommandWorker = createSupabaseCommandWorker({
  getSocket: () => currentSocket,
  sendText,
  logger: console,
});

/** Atraso da próxima reconexão: backoff exponencial (3s→60s) + jitter. */
function nextReconnectDelay() {
  const base = Math.min(60_000, 3000 * 2 ** reconnectAttempts);
  return base + Math.floor(Math.random() * 1000); // jitter p/ não sincronizar tentativas
}

/**
 * Agenda UMA reconexão (chama start() após `delay`). A trava `reconnecting`
 * garante que nunca há duas reconexões em voo — sem ela, o watchdog forçando um
 * end() somado a um "close" natural poderia abrir DOIS sockets do mesmo número,
 * que é o vetor de ban nº1. A trava é liberada quando o timer dispara (a próxima
 * queda pode reagendar) e de novo quando a conexão abre de fato.
 */
function scheduleReconnect(delay, reason) {
  if (reconnecting) return; // já há uma reconexão agendada — não duplica
  reconnecting = true;
  console.log(`   ↳ reconexão agendada em ${Math.round(delay / 1000)}s (${reason})`);
  setTimeout(() => {
    reconnecting = false; // o timer disparou; start() assume daqui
    start();
  }, delay);
}

/**
 * Chamado pelo watchdog quando o stream está zumbi. Encerra o socket atual —
 * o Baileys emite "close" e o handler existente reconecta (reusa o caminho, NÃO
 * cria conexão paralela). Fallback anti-stuck: se o end() não produzir "close"
 * (socket semi-morto), agenda a reconexão aqui — a trava `reconnecting` impede
 * que isso duplique com um "close" que venha logo em seguida.
 */
function onWatchdogDead() {
  const dying = currentSocket;
  try {
    dying?.end(new Error("watchdog: stream zumbi"));
  } catch {
    // end() pode lançar se o socket já estiver semi-morto — ignora
  }
  setTimeout(() => {
    // Se o "close" veio, ele já zerou currentSocket (e talvez agendou). Só agimos
    // quando o socket morto ainda é o "atual" E nada foi agendado.
    if (!reconnecting && currentSocket === dying) {
      currentSocket = null;
      scheduleReconnect(nextReconnectDelay(), "watchdog-fallback");
    }
  }, 5_000);
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
async function reportLead(phone, sourceGroup, sourceGroupId) {
  try {
    const res = await appFetch(`/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone ? `+${phone}` : "", sourceGroup, sourceGroupId }),
    });
    if (res.ok) console.log(`   ↳ lead registrado no app (${APP_URL}/leads)`);
    else console.log(`   ↳ app respondeu ${res.status} ao registrar lead`);
  } catch {
    console.log(`   ↳ app offline — lead não registrado (${APP_URL})`);
  }
}

// === Boas-vindas automáticas (Sprint 2) ===
// Config + opt-out vêm do app (self-service). Cache atualizado no heartbeat.
let welcomeCfg = { enabled: false, message: "" };
let optOutDigits = new Set(); // só dígitos, p/ comparar com o número que entrou
const welcomed = new Map(); // digits -> timestamp do envio (dedupe + poda diária)
const welcoming = new Set(); // dígitos com boas-vindas EM ANDAMENTO (evita corrida/duplo envio)

const onlyDigits = (s) => String(s).replace(/\D/g, "");

/** Busca config de boas-vindas + lista de opt-out no app. Fail-silent. */
async function refreshConfig() {
  try {
    const w = await appFetch(`/api/welcome`).then((r) => r.json());
    welcomeCfg = { enabled: !!w.enabled, message: w.message ?? "" };
  } catch {
    // mantém o cache anterior
  }
  try {
    const list = await appFetch(`/api/optout`).then((r) => r.json());
    optOutDigits = new Set((list ?? []).map((o) => onlyDigits(o.phone)));
  } catch {
    // mantém o cache anterior
  }
}

/**
 * Manda a DM de boas-vindas para quem acabou de entrar — SE habilitado,
 * fora do opt-out e ainda não saudado. Vai pela fila anti-ban (lane prioritária).
 */
async function welcomeNewMember(sock, phone) {
  if (!welcomeCfg.enabled || !welcomeCfg.message.trim()) return;
  if (!phone) return; // sem telefone real resolvido (LID não mapeado) não dá p/ DM com segurança
  const digits = onlyDigits(phone);
  if (optOutDigits.has(digits)) {
    console.log(`   ↳ boas-vindas puladas: +${digits} está no opt-out`);
    return;
  }
  if (welcomed.has(digits) || welcoming.has(digits)) return; // já saudado ou em andamento
  welcoming.add(digits);
  const jid = `${digits}@s.whatsapp.net`;
  const text = welcomeCfg.message.replaceAll("{nome}", "tudo bem"); // sem nome real na entrada
  try {
    // Lane NORMAL (não prioritária): boas-vindas em lote não pode furar o ritmo
    // anti-ban — DM a quem nunca te escreveu já é o maior vetor de ban.
    await sendText(sock, jid, text);
    welcomed.set(digits, Date.now()); // só marca DEPOIS do envio: falha transitória pode reenviar
    console.log(`   ↳ boas-vindas enviadas (via fila) para +${digits}`);
  } catch (err) {
    console.log(`   ↳ falha ao enviar boas-vindas para +${digits}: ${err.message}`);
  } finally {
    welcoming.delete(digits);
  }
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
async function runDispatch(sock, job) {
  // groupIds do app = JIDs (o sync usa o id do grupo). Vazio = todos os grupos ADMIN
  // (nunca dispara em grupo onde não somos admin).
  const jids = job.groupIds && job.groupIds.length ? job.groupIds : [...adminGroupIds];
  const total = jids.length;
  if (total === 0) {
    console.log(`⛔ Disparo "${job.name}" sem grupos de destino.`);
    await ackDispatch(job.id, "failed", 0, 0, "Nenhum grupo de destino.");
    return;
  }
  // Baixa a foto UMA vez (se a oferta tem mídia) e reusa em todos os grupos.
  let mediaBuf = null;
  if (job.mediaId) {
    mediaBuf = await fetchMedia(job.mediaId);
    if (!mediaBuf) console.log(`   ⚠️ não consegui baixar a foto da oferta — envio só o texto.`);
  }
  const tipo = `${mediaBuf ? (job.mediaType === "video" ? "🎬 vídeo" : "📷 foto") : "texto"}${job.mentionAll ? " + @todos" : ""}`;
  console.log(`\n🚀 Disparo "${job.name}" (${tipo}) → ${total} grupo(s). Entrando na fila anti-ban...`);
  await ackDispatch(job.id, "running", 0, total);

  const enviar = (jid) => {
    // "Marcar todos": menção invisível de todos os participantes. Passa como THUNK —
    // o groupMetadata só roda quando a fila pega a mensagem (não N em paralelo).
    const mentions = job.mentionAll ? () => groupParticipantJids(sock, jid) : undefined;
    // Enquete tem prioridade sobre texto/foto.
    if (job.poll?.question && Array.isArray(job.poll.options) && job.poll.options.length >= 2) {
      return queue.enqueue(async () => {
        const m = await resolveMentions(mentions);
        return sock.sendMessage(jid, {
          poll: { name: job.poll.question, values: job.poll.options, selectableCount: 1 },
          ...(m ? { mentions: m } : {}),
        });
      });
    }
    return mediaBuf
      ? sendMedia(sock, jid, mediaBuf, job.message, mentions, job.mediaType)
      : sendText(sock, jid, job.message, { mentions });
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
        .finally(() => ackDispatch(job.id, "running", sent, total)),
    ),
  );

  const status = sent === 0 ? "failed" : "sent";
  const error = failed > 0 ? `${failed} de ${total} não enviadas` : null;
  console.log(`✅ Disparo "${job.name}" concluído: ${sent}/${total} enviadas${failed ? ` (${failed} falhas)` : ""}.`);
  await ackDispatch(job.id, status, sent, total, error);
}

/** Reivindica ofertas enfileiradas no app e dispara cada uma. Fail-silent. */
async function pollDispatches(sock) {
  if (dispatching) return;
  dispatching = true;
  try {
    let jobs = [];
    try {
      jobs = await appFetch(`/api/dispatch/pending`, { method: "POST" }).then((r) => r.json());
    } catch {
      return; // app offline
    }
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    console.log(`\n📥 ${jobs.length} oferta(s) na fila de disparo.`);
    for (const job of jobs) {
      await runDispatch(sock, job);
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
async function runGrow(sock, job) {
  // create é a operação mais sensível — respeita a janela do group-guard (2/10min).
  const verdict = guard.check("create");
  if (!verdict.allowed) {
    console.log(`⛔ Auto-grow "${job.campaignSlug}" adiado: ${verdict.reason}.`);
    // Não é erro permanente: devolve failed com o motivo p/ o app re-enfileirar depois.
    await ackGrow(job.id, "failed", { error: `group-guard: ${verdict.reason} (retry ${verdict.retryAfterSec}s)` });
    return;
  }
  await ackGrow(job.id, "running");
  let meta;
  try {
    // 1) Cria o grupo só com o dono (populamos por link de convite, não por add).
    meta = await sock.groupCreate(job.subject, []);
    guard.record("create");
  } catch (err) {
    const code = classifyGroupOpError(err);
    console.log(`⚠️  Falha ao criar grupo "${job.subject}"${code ? ` (${code})` : ""}: ${err.message}`);
    await ackGrow(job.id, "failed", { error: `groupCreate: ${code ?? err.message}` });
    return;
  }
  const jid = meta.id;
  console.log(`\n🆕 Grupo criado: "${job.subject}" (${jid}). Auto-configurando...`);

  // 2) Config best-effort: uma falha aqui não invalida o grupo (o que importa é o link).
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      console.log(`   ⚠️ auto-grow: ${label} falhou (ignorado): ${err.message}`);
    }
  };
  if (job.desc) await step("descrição", () => sock.groupUpdateDescription(jid, job.desc));
  if (job.announce !== false) await step('"só admin envia"', () => sock.groupSettingUpdate(jid, "announcement"));
  await step("modo de adição", () => sock.groupMemberAddMode(jid, job.memberAddMode || "admin_add"));
  if (job.mediaId) {
    const buf = await fetchMedia(job.mediaId);
    if (buf) await step("foto", () => sock.updateProfilePicture(jid, buf));
  }

  // 3) Link de convite — é o que volta pro pool da campanha (/r/<campanha> roteia p/ cá).
  let inviteLink = null;
  try {
    const code = await sock.groupInviteCode(jid);
    if (code) inviteLink = `https://chat.whatsapp.com/${code}`;
  } catch (err) {
    console.log(`   ⚠️ auto-grow: não obtive o link de convite: ${err.message}`);
  }
  if (!inviteLink) {
    // Sem link, o grupo não serve ao pool — reporta failed p/ o app tentar de novo.
    await ackGrow(job.id, "failed", { whatsappGroupId: jid, error: "sem inviteLink (groupInviteCode falhou)" });
    return;
  }

  // 4) Passamos a monitorar o grupo novo (somos admin) — captura de lead + boas-vindas.
  //    O próximo sync /api/groups já o inclui; o app preserva o inviteUrl do ack.
  adminGroupIds.add(jid);
  groupNames.set(jid, job.subject);

  await ackGrow(job.id, "created", { whatsappGroupId: jid, members: meta.size ?? 1, inviteLink });
  console.log(`✅ Auto-grow "${job.campaignSlug}" concluído: ${job.subject} → ${inviteLink}`);
}

/** Reivindica jobs de criação de grupo e executa cada um. Fail-silent. */
async function pollGrow(sock) {
  if (growing) return;
  growing = true;
  try {
    let jobs = [];
    try {
      jobs = await appFetch(`/api/groups/grow/pending`, { method: "POST" }).then((r) => r.json());
    } catch {
      return; // app offline
    }
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    console.log(`\n🌱 ${jobs.length} grupo(s) a criar (auto-grow).`);
    for (const job of jobs) {
      await runGrow(sock, job);
    }
  } finally {
    growing = false;
  }
}

// Cache de nome dos grupos (id -> nome) para logar entradas de forma legível.
const groupNames = new Map();
// Grupos onde SOMOS admin — só monitoramos entradas (leads) destes.
const adminGroupIds = new Set();

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
      name: groupNames.get(groupId) ?? groupId,
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

async function start() {
  // Persiste a sessão na pasta ./auth — reconecta sem novo QR nas próximas vezes.
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  // A versão muda raramente; evita uma chamada de rede a cada reconexão.
  // Falha na busca (offline) cai no cache anterior, se houver.
  if (!cachedVersion) {
    try {
      ({ version: cachedVersion } = await fetchLatestBaileysVersion());
    } catch {
      // sem rede e sem cache: deixa o Baileys usar a versão embutida (version undefined)
    }
  }
  const version = cachedVersion ?? undefined; // undefined → Baileys usa a versão embutida
  console.log(`\n🚀 HUBFLOW Engine — Baileys (protocolo WhatsApp${version ? ` v${version.join(".")}` : ""})`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["HUBFLOW", "Chrome", "1.0.0"],
  });

  // Salva credenciais sempre que mudam (essencial para persistir a sessão).
  sock.ev.on("creds.update", saveCreds);

  // Recibos de entrega (status 3 = entregue, 4 = lido) alimentam o DeliveryTracker.
  sock.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (key?.fromMe && update?.status >= 3) delivery.onDeliveryReceipt(key.id);
    }
  });

  // Atividade dos grupos: conta mensagens de MEMBROS (não as minhas) nos grupos
  // admin. Alimenta "grupo vivo" e a etapa "Interagiram" do funil.
  sock.ev.on("messages.upsert", ({ messages = [], type }) => {
    if (type !== "notify") return; // só mensagens novas
    for (const msg of messages) {
      const jid = msg.key?.remoteJid ?? "";
      if (!jid.endsWith("@g.us") || msg.key?.fromMe) continue; // só grupos, não as minhas
      if (!adminGroupIds.has(jid)) continue; // só grupos admin
      recordActivity(jid, msg.key?.participant);
    }
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection) lastConnectionEventAt = new Date().toISOString();

    if (qr) {
      console.log("\n📲 Abra o WhatsApp > Aparelhos conectados > Conectar aparelho");
      console.log("   e escaneie o QR Code abaixo:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("\n✅ Conectado ao WhatsApp!");
      currentSocket = sock;
      reconnecting = false; // reconexão concluída — libera a trava
      watchdog?.stop(); // encerra o watchdog do socket anterior, se houver
      watchdog = new ConnectionWatchdog({ sock, onDead: onWatchdogDead, logger: console });
      watchdog.start();
      reconnectAttempts = 0; // conectou — reseta o backoff
      connectedSince = connectedSince ?? new Date().toISOString(); // mantém na reconexão transitória
      const w = warmup.status();
      console.log(`🔥 Warm-up: ${w.phase} (dia ${w.day}/${w.totalDays}, limite hoje: ${w.todayLimit} msgs)`);
      await reportSession(sock);
      await refreshConfig(); // carrega boas-vindas + opt-out do app
      await listGroups(sock); // popula groupNames ANTES de aceitar disparos
      clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        reportSession(sock); // mantém o painel "ao vivo"
        refreshConfig(); // mantém config de boas-vindas + opt-out frescos
        resyncGroupsIfNeeded(); // re-sync se o app subiu depois da engine
        reportActivity(); // envia o snapshot de atividade dos grupos
        saveState(); // persiste warmup + janelas de envio (sobrevive a restart)
        pruneMemory(); // descarta welcomed antigo + atividade de dias passados
      }, 30_000);
      // Loop de disparo dedicado (10s) — oferta enfileirada sai rápido. Junto vai o
      // poll de auto-grow (criar próximo grupo quando a campanha lota).
      clearInterval(dispatchTimer);
      dispatchTimer = setInterval(() => {
        pollDispatches(sock);
        pollGrow(sock);
      }, 10_000);
      pollDispatches(sock); // tenta já na conexão
      pollGrow(sock);
      supabaseCommandWorker.start();
      supabaseCommandWorkerStarted = true;
    }

    if (connection === "close") {
      // Ignora "close" de um socket que já NÃO é o atual (um mais novo assumiu).
      // Sem isto, um close atrasado do socket antigo zeraria o socket novo e
      // agendaria uma reconexão duplicada = 2 sockets do mesmo número (ban).
      if (currentSocket && currentSocket !== sock) return;
      currentSocket = null;
      watchdog?.stop(); // para de pingar o socket morto
      supabaseCommandWorker.stop();
      supabaseCommandWorkerStarted = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        // Logout/401: quase sempre QR expirado ou credencial velha. Limpa e gera QR novo.
        console.log("\n🔒 Sessão não autenticada (QR expirado ou auth velha). Limpando e gerando novo QR...");
        connectedSince = null; // sessão acabou de fato — zera o "conectado desde"
        await rm("auth", { recursive: true, force: true });
        scheduleReconnect(2000, "logout/auth-reset");
      } else {
        const wait = nextReconnectDelay();
        reconnectAttempts++;
        console.log(`\n⚠️  Conexão caiu (code ${code}).`);
        scheduleReconnect(wait, `queda code ${code}`);
      }
    }
  });

  // === O CORAÇÃO DO POC ===
  // Detecta quem ENTRA e quem SAI dos grupos — é o que fecha o loop clique -> entrada.
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id, participants = [], action } = update;

      // SÓ monitoramos grupos onde somos admin. Ignora todo o resto.
      if (!adminGroupIds.has(id)) return;

      let name = groupNames.get(id);
      if (!name) {
        try {
          name = (await sock.groupMetadata(id)).subject;
          groupNames.set(id, name);
        } catch {
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
          console.log(`\n🟢 ENTRADA: ${phone ? `+${phone}` : "(número oculto)"} entrou em "${name}"`);
          reportLead(phone, name, id); // grava o lead no app (Caminho A) — id = JID do grupo
          welcomeNewMember(sock, phone); // boas-vindas automáticas (Sprint 2)
        } else if (action === "remove") {
          const phone = await resolvePhone(sock, jid);
          console.log(`🔴 SAÍDA: ${phone ? `+${phone}` : "(número oculto)"} saiu de "${name}"`);
        }
      }
    } catch (err) {
      console.log(`⚠️  Erro ao processar evento de grupo (ignorado): ${err.message}`);
    }
  });
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

async function listGroups(sock) {
  const groups = await sock.groupFetchAllParticipating();
  const list = Object.values(groups);
  const mine = myIds(sock);

  const admin = list.filter((g) => isAdminOf(g, mine));

  // adminGroupIds = ÚNICA fonte de verdade do que monitoramos (captura de leads).
  // NUNCA cai para "todos": melhor não capturar do que capturar grupo errado.
  adminGroupIds.clear();
  for (const g of admin) {
    adminGroupIds.add(g.id);
    groupNames.set(g.id, g.subject);
  }
  // Nome dos demais grupos serve só p/ log legível (não monitora).
  for (const g of list) if (!groupNames.has(g.id)) groupNames.set(g.id, g.subject);

  console.log(`\n📋 ${admin.length} grupo(s) onde VOCÊ é admin (de ${list.length} no total):`);
  for (const g of admin) console.log(`   • ${g.subject} — ${g.participants.length} membros`);

  if (admin.length === 0 && list.length > 0) {
    console.log(
      "\n⚠️  Nenhum grupo admin detectado. NÃO vou monitorar entradas (evita lead de grupo alheio).\n" +
        "   Se você É admin de algum grupo, pode ser o formato LID do Baileys 7 — me avise para investigar.",
    );
  }

  // Sincroniza p/ o painel SÓ os grupos admin (é o universo que o produto opera).
  await syncGroups(admin);
  console.log("\n👀 Monitorando entradas só nos grupos ADMIN, em tempo real... (Ctrl+C para sair)");

}

// Último snapshot de grupos admin + se o último POST deu certo. Permite re-sync
// quando o app subiu DEPOIS da engine (o sync inicial é no connect, one-shot).
let lastGroupsPayload = null;
let groupsSynced = false;

/** POST /api/groups com o payload dado. Atualiza groupsSynced. Fail-silent. */
async function postGroups(payload, { quiet = false } = {}) {
  try {
    const res = await appFetch(`/api/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    groupsSynced = res.ok;
    if (!quiet) {
      if (res.ok) console.log(`   ↳ ${payload.groups.length} grupo(s) sincronizado(s) no painel (${APP_URL}/groups)`);
      else console.log(`   ↳ app respondeu ${res.status} ao sincronizar grupos`);
    }
  } catch {
    groupsSynced = false;
    if (!quiet) console.log(`   ↳ app offline — grupos não sincronizados (${APP_URL})`);
  }
}

/** Sincroniza a lista de grupos (admin) para o painel. Fail-silent. */
async function syncGroups(groups) {
  lastGroupsPayload = {
    groups: groups.map((g) => ({
      whatsappGroupId: g.id,
      name: g.subject,
      members: (g.participants ?? []).length,
    })),
  };
  await postGroups(lastGroupsPayload);
}

/**
 * Re-tenta o sync de grupos se o inicial falhou (app estava offline no connect).
 * Roda no heartbeat e para de tentar assim que sincroniza. Silencioso até dar certo.
 */
async function resyncGroupsIfNeeded() {
  if (groupsSynced || !lastGroupsPayload) return;
  await postGroups(lastGroupsPayload, { quiet: true });
  if (groupsSynced) console.log(`   ↳ grupos re-sincronizados no painel (app voltou ao ar).`);
}


async function bootstrap() {
  await loadBaileys();
  await start();
}

bootstrap().catch((error) => {
  console.error("Erro fatal ao iniciar a engine:", error);
  process.exit(1);
});
