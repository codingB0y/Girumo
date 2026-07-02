/**
 * HubFlow Engine — Entry point DEV
 *
 * Carrega a engine em modo mock, sem conexão real com WhatsApp.
 * Uso: node --env-file=.env.dev index-dev.js
 *   ou: ENGINE_MODE=mock node index-dev.js
 */

// Força modo mock se não definido
if (!process.env.ENGINE_MODE) process.env.ENGINE_MODE = "mock";
if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
if (!process.env.PORT) process.env.PORT = "3001";

const express = require("express");
const { getDevEngine } = require("./dev-mode");
const { validateEngineEnvironment, isMockMode } = require("./config/env");

// Valida ambiente
const validation = validateEngineEnvironment();
if (!validation.valid) {
  console.error("\n❌ ENGINE: Validação falhou:");
  validation.errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
}
validation.warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));

// Bloqueia se não estiver em mock
if (!isMockMode()) {
  console.error("\n❌ index-dev.js só pode rodar com ENGINE_MODE=mock");
  console.error("   Use 'node index.js' para modo real.\n");
  process.exit(1);
}

const app = express();
app.use(express.json());

const engine = getDevEngine();

// ---- Health ----
app.get("/", (req, res) => {
  res.send("HUBFLOW Engine DEV (MOCK) online");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "hubflow-engine",
    mode: "mock",
    whatsappConnected: false,
    sessions: engine.listSessions().length,
    uptime: process.uptime(),
  });
});

// ---- Sessions ----
app.get("/dev/sessions", (req, res) => {
  res.json(engine.listSessions());
});

app.post("/dev/sessions/:id", (req, res) => {
  const socket = engine.getSession(req.params.id);
  res.json({ ok: true, session: req.params.id, connected: socket.connected });
});

app.delete("/dev/sessions/:id", (req, res) => {
  engine.removeSession(req.params.id);
  res.json({ ok: true, removed: req.params.id });
});

// ---- Mock Send ----
app.post("/dev/send", async (req, res) => {
  const { session = "default", to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: "to e text são obrigatórios" });

  const socket = engine.getSession(session);
  const msg = await socket.sendMessage(`${to}@s.whatsapp.net`, { text });
  res.json({ ok: true, message: msg });
});

// ---- Mock Receive (simula mensagem recebida) ----
app.post("/dev/receive", (req, res) => {
  const { session = "default", from, text } = req.body;
  if (!from || !text) return res.status(400).json({ error: "from e text são obrigatórios" });

  const msg = engine.simulateIncomingMessage(session, from, text);
  res.json({ ok: true, message: msg });
});

// ---- Mock Webhook ----
app.post("/dev/webhook", (req, res) => {
  const { type, data } = req.body;
  const result = engine.simulateWebhook(type || "test", data || {});
  res.json(result);
});

// ---- Logs ----
app.get("/dev/logs", (req, res) => {
  res.json(engine.getLogs());
});

// ---- Reset ----
app.post("/dev/reset", (req, res) => {
  engine.reset();
  res.json({ ok: true, message: "Engine mock resetada" });
});

// ---- Start ----
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Engine DEV (MOCK) rodando em http://localhost:${PORT}`);
  console.log(`   Endpoints disponíveis:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /dev/sessions`);
  console.log(`   POST /dev/sessions/:id`);
  console.log(`   DEL  /dev/sessions/:id`);
  console.log(`   POST /dev/send        { session, to, text }`);
  console.log(`   POST /dev/receive     { session, from, text }`);
  console.log(`   POST /dev/webhook     { type, data }`);
  console.log(`   GET  /dev/logs`);
  console.log(`   POST /dev/reset\n`);
});
