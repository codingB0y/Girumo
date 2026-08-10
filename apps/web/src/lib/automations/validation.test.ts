import assert from "node:assert/strict";
import {
  LOJISTA_TRIGGERS,
  MAX_STEPS,
  MESSAGE_MAX_CHARS,
  WAIT_MAX_MINUTES,
  createAutomationSchema,
  patchAutomationSchema,
  normalizeSteps,
} from "./validation";

const validMessage = { type: "message", delay_minutes: 0, message: "Bem-vindo(a)! Catálogo fixado no grupo." };
const validWait = { type: "wait", delay_minutes: 5 };

// ── create: payload no formato dos templates passa ─────────────────────────
{
  const r = createAutomationSchema.safeParse({
    name: "Boas-vindas no grupo",
    trigger: "lead_entered",
    steps: [validWait, validMessage],
  });
  assert.ok(r.success, `payload de template deveria passar: ${!r.success ? r.error.message : ""}`);
}

// Todos os triggers de lojista são aceitos.
for (const trigger of LOJISTA_TRIGGERS) {
  const r = createAutomationSchema.safeParse({ name: "x", trigger, steps: [validMessage] });
  assert.ok(r.success, `trigger ${trigger} deveria ser aceito`);
}

// ── triggers retirados (lifecycle interno) e desconhecidos são rejeitados ──
for (const trigger of ["no_connect_24h", "trial_ending", "qualquer-coisa", ""]) {
  const create = createAutomationSchema.safeParse({ name: "x", trigger, steps: [validMessage] });
  assert.ok(!create.success, `create com trigger ${trigger} deveria falhar`);
  const patch = patchAutomationSchema.safeParse({ id: "a1", trigger });
  assert.ok(!patch.success, `patch com trigger ${trigger} deveria falhar`);
}

// ── steps: o exploit real do PATCH (steps não-array) é rejeitado ───────────
assert.ok(!patchAutomationSchema.safeParse({ id: "a1", steps: "nao-e-array" }).success);
assert.ok(!patchAutomationSchema.safeParse({ id: "a1", steps: 42 }).success);
assert.ok(!patchAutomationSchema.safeParse({ id: "a1", steps: [{}] }).success);

// Campos desconhecidos num step (ex.: phone/jid pra tentar DM) são rejeitados.
assert.ok(
  !createAutomationSchema.safeParse({
    name: "x",
    trigger: "lead_entered",
    steps: [{ ...validMessage, phone: "5511999999999" }],
  }).success,
  "step com campo extra (phone) deveria ser rejeitado",
);
assert.ok(
  !patchAutomationSchema.safeParse({ id: "a1", steps: [{ ...validMessage, jid: "x@s.whatsapp.net" }] }).success,
  "step com campo extra (jid) deveria ser rejeitado",
);

// Step "condition" está fora do v1 — rejeitado na entrada.
assert.ok(
  !createAutomationSchema.safeParse({
    name: "x",
    trigger: "lead_entered",
    steps: [validMessage, { type: "condition", delay_minutes: 0, condition: "lead.tag == vip" }],
  }).success,
);

// ── limites de mensagem ────────────────────────────────────────────────────
assert.ok(
  !createAutomationSchema.safeParse({
    name: "x",
    trigger: "lead_entered",
    steps: [{ type: "message", delay_minutes: 0, message: "" }],
  }).success,
  "mensagem vazia deveria falhar",
);
assert.ok(
  !createAutomationSchema.safeParse({
    name: "x",
    trigger: "lead_entered",
    steps: [{ type: "message", delay_minutes: 0, message: "a".repeat(MESSAGE_MAX_CHARS + 1) }],
  }).success,
  "mensagem acima do limite deveria falhar",
);

// ── limites de espera ──────────────────────────────────────────────────────
assert.ok(!createAutomationSchema.safeParse({ name: "x", trigger: "lead_entered", steps: [{ type: "wait", delay_minutes: 2 }, validMessage] }).success, "wait < 5 min deveria falhar");
assert.ok(!createAutomationSchema.safeParse({ name: "x", trigger: "lead_entered", steps: [{ type: "wait", delay_minutes: WAIT_MAX_MINUTES + 1 }, validMessage] }).success, "wait > 30 dias deveria falhar");
assert.ok(!createAutomationSchema.safeParse({ name: "x", trigger: "lead_entered", steps: [{ type: "message", delay_minutes: 1.5, message: "oi" }] }).success, "delay não-inteiro deveria falhar");
assert.ok(!createAutomationSchema.safeParse({ name: "x", trigger: "lead_entered", steps: [{ type: "message", delay_minutes: -1, message: "oi" }] }).success, "delay negativo deveria falhar");

// ── limites estruturais ────────────────────────────────────────────────────
assert.ok(
  !createAutomationSchema.safeParse({
    name: "x",
    trigger: "lead_entered",
    steps: Array.from({ length: MAX_STEPS + 1 }, () => validMessage),
  }).success,
  "mais de MAX_STEPS deveria falhar",
);
assert.ok(
  !createAutomationSchema.safeParse({ name: "x", trigger: "lead_entered", steps: [] }).success,
  "zero steps deveria falhar",
);
assert.ok(
  !createAutomationSchema.safeParse({ name: "x", trigger: "lead_entered", steps: [validWait] }).success,
  "sequência sem nenhum step de mensagem deveria falhar",
);

// ── name ───────────────────────────────────────────────────────────────────
assert.ok(!createAutomationSchema.safeParse({ name: "", trigger: "lead_entered", steps: [validMessage] }).success);
assert.ok(!createAutomationSchema.safeParse({ name: "   ", trigger: "lead_entered", steps: [validMessage] }).success);
assert.ok(!createAutomationSchema.safeParse({ name: "a".repeat(121), trigger: "lead_entered", steps: [validMessage] }).success);

// ── patch parcial ──────────────────────────────────────────────────────────
{
  const r = patchAutomationSchema.safeParse({ id: "a1", enabled: false });
  assert.ok(r.success, "patch só com enabled deveria passar");
}
assert.ok(!patchAutomationSchema.safeParse({ id: "a1", enabled: "yes" }).success, "enabled não-boolean deveria falhar");
assert.ok(!patchAutomationSchema.safeParse({ enabled: true }).success, "patch sem id deveria falhar");

// ── normalizeSteps: preenche ids ausentes, preserva existentes ─────────────
{
  const steps = normalizeSteps([
    { type: "wait", delay_minutes: 5 },
    { type: "message", delay_minutes: 0, message: "oi", id: "meu-id" },
  ]);
  assert.equal(steps[0].id, "step-1");
  assert.equal(steps[1].id, "meu-id");
  assert.equal(steps.length, 2);
}

console.log("automations/validation tests passed");
