/**
 * DEV MODE — Mock completo da engine WhatsApp.
 *
 * Quando ENGINE_MODE=mock, este módulo substitui o Baileys real por um
 * simulador que:
 * - NÃO conecta sessões reais
 * - NÃO envia mensagens reais
 * - NÃO reutiliza tokens
 * - NÃO sincroniza com produção
 * - USA sessões locais em ./dev-sessions
 * - LOGA tudo para debug
 *
 * Uso: require('./dev-mode') retorna { createMockSocket, MockEngine }
 */

const { EventEmitter } = require("events");
const path = require("path");
const fs = require("fs");

const DEV_SESSIONS_PATH = process.env.ENGINE_DEV_SESSIONS_PATH
  || path.join(__dirname, "dev-sessions");

// Garante que o diretório existe
if (!fs.existsSync(DEV_SESSIONS_PATH)) {
  fs.mkdirSync(DEV_SESSIONS_PATH, { recursive: true });
}

/**
 * Fake JID generator
 */
function fakeJid(number) {
  return `${number || "5511999990000"}@s.whatsapp.net`;
}

/**
 * Mock de mensagem enviada
 */
function createMockMessage(to, text, opts = {}) {
  const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    key: {
      remoteJid: fakeJid(to),
      fromMe: true,
      id,
    },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 2, // SERVER_ACK
    ...opts,
  };
}

/**
 * Mock Socket — simula interface do Baileys WASocket
 */
class MockSocket extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.user = { id: fakeJid("5511999990000"), name: "HubFlow Dev" };
    this.connected = true;
    this.messageLog = [];

    console.log(`[DEV-ENGINE] 🟢 Mock socket criado para sessão: ${sessionId}`);
    console.log(`[DEV-ENGINE]    Path: ${DEV_SESSIONS_PATH}`);

    // Simula conexão após 500ms
    setTimeout(() => {
      this.emit("connection.update", {
        connection: "open",
        lastDisconnect: undefined,
        qr: undefined,
      });
    }, 500);
  }

  /**
   * Mock: sendMessage — loga mas não envia nada real
   */
  async sendMessage(jid, content, opts = {}) {
    const text = content?.text || content?.conversation || JSON.stringify(content);
    const msg = createMockMessage(jid, text);

    this.messageLog.push({
      timestamp: new Date().toISOString(),
      to: jid,
      content: text,
      type: Object.keys(content)[0],
      opts,
    });

    console.log(`[DEV-ENGINE] 📤 MOCK SEND → ${jid}`);
    console.log(`[DEV-ENGINE]    Conteúdo: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
    console.log(`[DEV-ENGINE]    ID: ${msg.key.id}`);
    console.log(`[DEV-ENGINE]    Total enviados: ${this.messageLog.length}`);

    // Simula delay de rede
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    // Emite evento como se tivesse sido enviado
    this.emit("messages.upsert", {
      messages: [msg],
      type: "append",
    });

    return msg;
  }

  /**
   * Mock: groupMetadata
   */
  async groupMetadata(jid) {
    return {
      id: jid,
      subject: "[DEV] Grupo de Teste",
      owner: fakeJid("5511999990000"),
      creation: Math.floor(Date.now() / 1000) - 86400,
      participants: [
        { id: fakeJid("5511999990000"), admin: "superadmin" },
        { id: fakeJid("5511999990001"), admin: null },
        { id: fakeJid("5511999990002"), admin: null },
        { id: fakeJid("5511999990003"), admin: "admin" },
      ],
      desc: "Grupo mock para desenvolvimento local",
    };
  }

  /**
   * Mock: groupCreate
   */
  async groupCreate(subject, participants) {
    const gid = `${Date.now()}@g.us`;
    console.log(`[DEV-ENGINE] 👥 MOCK GROUP CREATE: "${subject}" com ${participants.length} membros`);
    return { id: gid, subject, participants };
  }

  /**
   * Mock: groupParticipantsUpdate
   */
  async groupParticipantsUpdate(jid, participants, action) {
    console.log(`[DEV-ENGINE] 👥 MOCK GROUP UPDATE: ${action} ${participants.length} em ${jid}`);
    return participants.map((p) => ({ status: "200", jid: p }));
  }

  /**
   * Mock: presenceSubscribe
   */
  async presenceSubscribe(jid) {
    console.log(`[DEV-ENGINE] 👁️ MOCK PRESENCE: subscribe ${jid}`);
  }

  /**
   * Mock: sendPresenceUpdate
   */
  async sendPresenceUpdate(type, jid) {
    console.log(`[DEV-ENGINE] 👁️ MOCK PRESENCE: ${type} → ${jid || "broadcast"}`);
  }

  /**
   * Mock: logout / end
   */
  async logout() {
    this.connected = false;
    console.log(`[DEV-ENGINE] 🔴 Mock socket desconectado: ${this.sessionId}`);
    this.emit("connection.update", { connection: "close" });
  }

  end() {
    this.logout();
  }

  /**
   * Retorna log de todas as mensagens "enviadas"
   */
  getMessageLog() {
    return [...this.messageLog];
  }

  /**
   * Limpa log de mensagens
   */
  clearMessageLog() {
    this.messageLog = [];
  }
}

/**
 * MockEngine — gerencia múltiplas sessões mock
 */
class MockEngine {
  constructor() {
    this.sessions = new Map();
    this.webhookLog = [];
    console.log("\n" + "=".repeat(50));
    console.log("  🧪 HUBFLOW ENGINE — DEV MODE (MOCK)");
    console.log("  ⚠️  Nenhuma conexão real será estabelecida");
    console.log("  📁 Sessions: " + DEV_SESSIONS_PATH);
    console.log("=".repeat(50) + "\n");
  }

  /**
   * Cria ou retorna sessão mock
   */
  getSession(sessionId = "default") {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const socket = new MockSocket(sessionId);
    this.sessions.set(sessionId, socket);

    // Salva referência da sessão no dev-sessions
    const sessionFile = path.join(DEV_SESSIONS_PATH, `${sessionId}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify({
      id: sessionId,
      created: new Date().toISOString(),
      type: "mock",
      connected: true,
    }, null, 2));

    return socket;
  }

  /**
   * Remove sessão mock
   */
  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.end();
      this.sessions.delete(sessionId);

      const sessionFile = path.join(DEV_SESSIONS_PATH, `${sessionId}.json`);
      if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);

      console.log(`[DEV-ENGINE] 🗑️ Sessão removida: ${sessionId}`);
    }
  }

  /**
   * Lista sessões ativas
   */
  listSessions() {
    return Array.from(this.sessions.entries()).map(([id, socket]) => ({
      id,
      connected: socket.connected,
      messagesSent: socket.messageLog.length,
    }));
  }

  /**
   * Simula recebimento de mensagem (para testar webhooks)
   */
  simulateIncomingMessage(sessionId, from, text) {
    const socket = this.sessions.get(sessionId || "default");
    if (!socket) {
      console.log(`[DEV-ENGINE] ❌ Sessão não encontrada: ${sessionId}`);
      return null;
    }

    const msg = {
      key: {
        remoteJid: fakeJid(from),
        fromMe: false,
        id: `mock_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: `Dev User ${from?.slice(-4) || "0000"}`,
    };

    console.log(`[DEV-ENGINE] 📥 MOCK RECEIVE ← ${from}: "${text}"`);

    socket.emit("messages.upsert", {
      messages: [msg],
      type: "notify",
    });

    this.webhookLog.push({
      timestamp: new Date().toISOString(),
      type: "incoming",
      from,
      text,
    });

    return msg;
  }

  /**
   * Simula webhook (status de mensagem)
   */
  simulateWebhook(type, data) {
    console.log(`[DEV-ENGINE] 🔔 MOCK WEBHOOK: ${type}`, data);
    this.webhookLog.push({ timestamp: new Date().toISOString(), type, data });
    return { ok: true, type, data };
  }

  /**
   * Retorna todos os logs
   */
  getLogs() {
    const allMessages = [];
    for (const [id, socket] of this.sessions) {
      allMessages.push(...socket.messageLog.map((m) => ({ ...m, session: id })));
    }
    return {
      sessions: this.listSessions(),
      messages: allMessages,
      webhooks: this.webhookLog,
    };
  }

  /**
   * Reset completo — limpa tudo
   */
  reset() {
    for (const [id] of this.sessions) {
      this.removeSession(id);
    }
    this.webhookLog = [];
    console.log("[DEV-ENGINE] 🔄 Reset completo — todas sessões removidas");
  }
}

/**
 * Factory: cria mock socket (drop-in replacement para connectToWhatsApp)
 */
function createMockSocket(sessionId = "default") {
  const engine = getDevEngine();
  return engine.getSession(sessionId);
}

// Singleton
let _devEngine = null;
function getDevEngine() {
  if (!_devEngine) _devEngine = new MockEngine();
  return _devEngine;
}

module.exports = {
  createMockSocket,
  MockEngine,
  MockSocket,
  getDevEngine,
  DEV_SESSIONS_PATH,
};
