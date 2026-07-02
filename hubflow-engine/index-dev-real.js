/**
 * HubFlow Engine — Entry point DEV com Baileys REAL (isolado)
 *
 * Diferencas do index.js (producao):
 *  - Forca ENGINE_MODE=development
 *  - Sessoes salvas em ./dev-sessions/whatsapp/ (NAO em ./sessions)
 *  - Bloqueia se SUPABASE_URL/ENGINE_TOKEN parecerem de producao
 *  - Sem command worker Supabase (engine DEV isolada)
 *
 * Uso:  node index-dev-real.js
 *   ou: ENGINE_MODE=development node index-dev-real.js
 */

const fs = require("fs");
const path = require("path");

// FORCAR MODO DEV
process.env.ENGINE_MODE = "development";
process.env.NODE_ENV = "development";
if (!process.env.PORT) process.env.PORT = "3001";

// VALIDACAO ANTI-PRODUCAO
const supabaseUrl = process.env.SUPABASE_URL || "";
const engineToken = process.env.ENGINE_TOKEN || "";

if (
  supabaseUrl.includes("prod") ||
  supabaseUrl.includes("production") ||
  engineToken.startsWith("prod_")
) {
  console.error("\n[ERR0] Esta engine DEV nao pode rodar com URL/token de producao.");
  console.error("      Use o projeto Supabase DEV (hubflow-dev) e um ENGINE_TOKEN proprio.\n");
  process.exit(1);
}

if (!supabaseUrl) {
  console.error("\n[ERR0] SUPABASE_URL nao configurada. Configure no .env.dev");
  process.exit(1);
}

console.log("\n[DEV] ENGINE DEV (BAILEYS REAL) — modo isolado");
console.log("      Supabase: " + supabaseUrl);
console.log("      Sessoes:  ./dev-sessions/whatsapp/\n");

// SETUP BAILEYS
const express = require("express");
const app = express();
app.use(express.json());

const pino = require("pino");
const qrcode = require("qrcode-terminal");
const baileys = require("@whiskeysockets/baileys");
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
const makeWASocket = baileys.default || baileys;

const logger = pino({ level: "silent" });

// Diretorio ISOLADO de sessoes DEV
const DEV_SESSIONS_DIR = path.join(__dirname, "dev-sessions", "whatsapp");

if (!fs.existsSync(DEV_SESSIONS_DIR)) {
  fs.mkdirSync(DEV_SESSIONS_DIR, { recursive: true });
}

let currentSocket = null;
let qrCodeData = null;
let connectedNumber = null;
let connectedSince = null;
let reconnectAttempts = 0;

// ENDPOINTS
app.get("/", (req, res) => {
  res.send("HUBFLOW Engine DEV (BAILEYS REAL) online");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "hubflow-engine",
    mode: "development-baileys",
    whatsappConnected: Boolean(currentSocket && currentSocket.user),
    connectedNumber: connectedNumber,
    sessionsDir: "dev-sessions/whatsapp",
    uptime: process.uptime(),
  });
});

app.get("/qr", (req, res) => {
  if (currentSocket && currentSocket.user) {
    return res.json({ connected: true, number: connectedNumber });
  }
  if (!qrCodeData) {
    return res.json({ connected: false, qr: null, message: "QR ainda nao gerado. Aguarde ~3s." });
  }
  res.json({ connected: false, qr: qrCodeData });
});

// QR no terminal (pra escanear via CLI)
app.get("/qr-terminal", (req, res) => {
  if (!qrCodeData) return res.status(404).json({ error: "QR nao disponivel" });
  qrcode.generate(qrCodeData, { small: true });
  res.json({ ok: true, message: "QR impresso no terminal" });
});

// CONEXAO WHATSAPP
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(DEV_SESSIONS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version: version,
    logger: logger,
    auth: state,
    printQRInTerminal: false,
    browser: ["HubFlow-Dev", "Chrome", "120.0.0"],
  });

  currentSocket = sock;

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = qr;
      console.log("\n[QR] QR CODE GERADO!");
      console.log("     Acesse http://localhost:3001/qr pra ver a imagem");
      console.log("     Ou http://localhost:3001/qr-terminal pra ver no terminal\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("\n[OK] Conectado ao WhatsApp!");
      qrCodeData = null;
      connectedNumber = sock.user && sock.user.id ? sock.user.id.split(":")[0] : null;
      connectedSince = new Date();
      console.log("     Numero: " + connectedNumber);
      console.log("     Sessao salva em: " + DEV_SESSIONS_DIR + "\n");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log("\n[X] Desconectado. Status: " + statusCode);

      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log("     Reconectando em " + (delay / 1000) + "s (tentativa " + reconnectAttempts + ")...\n");
        setTimeout(() => connectToWhatsApp(), delay);
      } else {
        console.log("     Sessao deslogada. Delete dev-sessions/ pra reconectar.\n");
        currentSocket = null;
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Mensagens recebidas (log)
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type === "notify") {
      for (const msg of m.messages) {
        const from = msg.key && msg.key.remoteJid;
        const text = (msg.message && msg.message.conversation) || (msg.message && msg.message.extendedTextMessage && msg.message.extendedTextMessage.text);
        if (text) console.log("[IN] [" + from + "]: " + text);
      }
    }
  });
}

// START
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log("\n[BOOT] Engine DEV (BAILEYS REAL) na porta " + PORT);
  console.log("        Health:   http://localhost:" + PORT + "/health");
  console.log("        QR JSON:  http://localhost:" + PORT + "/qr");
  console.log("        QR Term:  http://localhost:" + PORT + "/qr-terminal\n");
  connectToWhatsApp();
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\n[OFF] Encerrando engine DEV...");
  if (currentSocket) await currentSocket.end();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  if (currentSocket) await currentSocket.end();
  process.exit(0);
});