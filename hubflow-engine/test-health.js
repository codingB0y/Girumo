const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildHealthResponse,
  createHealthHandler,
  registerHealthRoutes,
} = require("./health.js");

test("liveness independe das integrações", () => {
  const result = buildHealthResponse("live", {
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status, "live");
});

test("readiness falha fechada sem WhatsApp", () => {
  const result = buildHealthResponse("ready", {
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  });

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.status, "not_ready");
});

test("readiness aprova WhatsApp conectado", () => {
  const result = buildHealthResponse("ready", {
    whatsappConnected: true,
    supabaseWorker: true,
    uptime: 12,
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "ready");
});

test("resposta não expõe dados fora do contrato", () => {
  const result = buildHealthResponse("ready", {
    whatsappConnected: true,
    supabaseWorker: true,
    uptime: 12,
    engineToken: "secret",
    tenantId: "tenant",
    phoneNumber: "5511999999999",
  });

  assert.deepEqual(Object.keys(result.body).sort(), [
    "ok",
    "service",
    "status",
    "supabaseWorker",
    "uptime",
    "whatsappConnected",
  ]);
});

test("handler aplica status HTTP e snapshot atual", () => {
  const handler = createHealthHandler("ready", () => ({
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  }));
  const observed = {};
  const response = {
    status(code) {
      observed.statusCode = code;
      return this;
    },
    json(body) {
      observed.body = body;
      return this;
    },
  };

  handler({}, response);

  assert.equal(observed.statusCode, 503);
  assert.equal(observed.body.status, "not_ready");
});

test("registra liveness, readiness e alias compatível", () => {
  const routes = new Map();
  const app = {
    get(path, handler) {
      routes.set(path, handler);
    },
  };

  registerHealthRoutes(app, () => ({
    whatsappConnected: false,
    supabaseWorker: false,
    uptime: 12,
  }));

  assert.deepEqual([...routes.keys()], ["/health/live", "/health/ready", "/health"]);
  assert.equal(typeof routes.get("/health/live"), "function");
  assert.equal(typeof routes.get("/health/ready"), "function");
  assert.equal(typeof routes.get("/health"), "function");
});
