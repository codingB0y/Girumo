import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  captureFromEvent,
  parseParticipantsPayload,
  type CaptureDeps,
  type EngineEventRow,
  type GroupInfo,
  type LeadEnteredTriggerInput,
  type UpsertLeadInput,
} from "./lead-capture.js";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "web",
  "src",
  "lib",
  "evolution",
  "__fixtures__",
);

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
}

const TENANT = "11111111-1111-1111-1111-111111111111";

/** Deps fake que registram chamadas, para asserir a lógica sem banco. */
function fakeDeps(overrides: {
  group?: GroupInfo | null;
  optedOut?: Set<string>;
} = {}) {
  const upserts: UpsertLeadInput[] = [];
  const optOutChecks: string[] = [];
  const triggers: LeadEnteredTriggerInput[] = [];
  let getGroupCalls = 0;
  let nextLeadId = 1;

  const deps: CaptureDeps = {
    async getGroup() {
      getGroupCalls += 1;
      return overrides.group === undefined ? { name: "Grupo VIP", isAdmin: true } : overrides.group;
    },
    async isOptedOut(_tenantId, phone) {
      optOutChecks.push(phone);
      return overrides.optedOut?.has(phone) ?? false;
    },
    async upsertLead(input) {
      upserts.push(input);
      return `lead-${nextLeadId++}`;
    },
    async triggerLeadEnteredAutomations(input) {
      triggers.push(input);
    },
  };

  return {
    deps,
    upserts,
    optOutChecks,
    triggers,
    getGroupCalls: () => getGroupCalls,
  };
}

function eventRow(payload: unknown, type = "group-participants.update"): EngineEventRow {
  return { event_id: "evt-1", tenant_id: TENANT, type, payload };
}

test("ignora evento que não é group-participants.update", async () => {
  const f = fakeDeps();
  const outcome = await captureFromEvent(eventRow({}, "messages.update"), f.deps);
  assert.equal(outcome.leads, 0);
  assert.equal(outcome.reason, "not-participants-event");
  assert.equal(f.getGroupCalls(), 0);
});

test("action remove é registrada mas não vira lead", async () => {
  const f = fakeDeps();
  const outcome = await captureFromEvent(eventRow(fixture("group-participants-update.remove.json")), f.deps);
  assert.equal(outcome.leads, 0);
  assert.equal(outcome.reason, "action:remove");
  assert.equal(f.upserts.length, 0);
  // Nem consulta o grupo: a ação já descarta antes.
  assert.equal(f.getGroupCalls(), 0);
});

test("grupo desconhecido não captura", async () => {
  const f = fakeDeps({ group: null });
  const outcome = await captureFromEvent(eventRow(fixture("group-participants-update.add.json")), f.deps);
  assert.equal(outcome.leads, 0);
  assert.equal(outcome.reason, "group-unknown");
  assert.equal(f.upserts.length, 0);
});

test("grupo onde não somos admin não captura", async () => {
  const f = fakeDeps({ group: { name: "Grupo alheio", isAdmin: false } });
  const outcome = await captureFromEvent(eventRow(fixture("group-participants-update.add.json")), f.deps);
  assert.equal(outcome.leads, 0);
  assert.equal(outcome.reason, "group-not-admin");
  assert.equal(f.upserts.length, 0);
});

test("add em grupo admin cria o lead com telefone e nome do grupo", async () => {
  const f = fakeDeps();
  const outcome = await captureFromEvent(eventRow(fixture("group-participants-update.add.json")), f.deps);
  assert.equal(outcome.leads, 1);
  assert.equal(outcome.optedOut, 0);
  assert.equal(f.upserts.length, 1);
  assert.equal(f.upserts[0].phone, "5511999990002");
  assert.equal(f.upserts[0].sourceGroupName, "Grupo VIP");
  assert.equal(f.upserts[0].sourceGroupId, "12036120363099999999999@g.us");
  assert.equal(f.upserts[0].tenantId, TENANT);
});

test("participante em opt-out é pulado, sem lead", async () => {
  const f = fakeDeps({ optedOut: new Set(["5511999990002"]) });
  const outcome = await captureFromEvent(eventRow(fixture("group-participants-update.add.json")), f.deps);
  assert.equal(outcome.leads, 0);
  assert.equal(outcome.optedOut, 1);
  assert.equal(f.upserts.length, 0);
  // Opt-out bloqueia a captura inteira — nunca chega a disparar automação.
  assert.equal(f.triggers.length, 0);
});

test("lead capturado dispara lead_entered com o id do lead e o grupo em que entrou", async () => {
  const f = fakeDeps();
  await captureFromEvent(eventRow(fixture("group-participants-update.add.json")), f.deps);
  assert.equal(f.triggers.length, 1);
  assert.equal(f.triggers[0].tenantId, TENANT);
  assert.equal(f.triggers[0].leadId, "lead-1");
  assert.equal(f.triggers[0].groupJid, "12036120363099999999999@g.us");
});

test("cada participante capturado num evento em lote dispara seu próprio trigger", async () => {
  const payload = {
    data: {
      id: "12036120363099999999999@g.us",
      action: "add",
      participants: [
        { id: "a@lid", phoneNumber: "5511999990010@s.whatsapp.net" },
        { id: "b@lid", phoneNumber: "5511999990011@s.whatsapp.net" },
      ],
    },
  };
  const f = fakeDeps();
  await captureFromEvent(eventRow(payload), f.deps);
  assert.equal(f.triggers.length, 2);
  assert.equal(f.triggers[0].leadId, "lead-1");
  assert.equal(f.triggers[1].leadId, "lead-2");
});

test("participante @lid sem telefone vira lead com phone null, sem checar opt-out", async () => {
  const payload = {
    data: {
      id: "12036120363099999999999@g.us",
      action: "add",
      participants: [{ id: "20100000000000009@lid", phoneNumber: null, admin: null }],
    },
  };
  const f = fakeDeps();
  const outcome = await captureFromEvent(eventRow(payload), f.deps);
  assert.equal(outcome.leads, 1);
  assert.equal(f.upserts[0].phone, null);
  // Sem telefone não há como consultar opt-out.
  assert.equal(f.optOutChecks.length, 0);
});

test("captura múltiplos participantes num só evento", async () => {
  const payload = {
    data: {
      id: "12036120363099999999999@g.us",
      action: "add",
      participants: [
        { id: "a@lid", phoneNumber: "5511999990010@s.whatsapp.net" },
        { id: "b@lid", phoneNumber: "5511999990011@s.whatsapp.net" },
      ],
    },
  };
  const f = fakeDeps();
  const outcome = await captureFromEvent(eventRow(payload), f.deps);
  assert.equal(outcome.leads, 2);
  assert.equal(f.upserts.length, 2);
});

test("parseParticipantsPayload rejeita payloads malformados", () => {
  assert.equal(parseParticipantsPayload(null), null);
  assert.equal(parseParticipantsPayload("x"), null);
  assert.equal(parseParticipantsPayload({}), null);
  assert.equal(parseParticipantsPayload({ data: {} }), null);
  assert.equal(parseParticipantsPayload({ data: { id: "g@g.us", action: "add" } }), null);
});

test("parseParticipantsPayload lê a fixture real", () => {
  const parsed = parseParticipantsPayload(fixture("group-participants-update.add.json"));
  assert.ok(parsed);
  assert.equal(parsed?.action, "add");
  assert.equal(parsed?.groupId, "12036120363099999999999@g.us");
  assert.equal(parsed?.participants.length, 1);
});
