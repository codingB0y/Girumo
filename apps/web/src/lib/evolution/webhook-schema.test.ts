import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  mapConnectionState,
  parseEvolutionWebhook,
  phoneFromWuid,
  stripCredentials,
} from "./webhook-schema";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
}

// As 6 fixtures são payloads reais capturados na F1 contra a v2.3.7 no ar.
// Se um destes parses quebrar, o contrato mudou — não "conserte" o teste.
const ALL_FIXTURES = [
  "qrcode-updated",
  "connection-update.open",
  "group-participants-update.add",
  "group-participants-update.remove",
  "groups-upsert",
  "messages-update",
];

test("every real fixture parses", () => {
  for (const name of ALL_FIXTURES) {
    const result = parseEvolutionWebhook(fixture(name));
    assert.equal(result.ok, true, `${name} deveria passar: ${result.ok ? "" : result.error}`);
  }
});

test("event discriminator uses dotted names, not the configured event names", () => {
  const result = parseEvolutionWebhook(fixture("connection-update.open"));
  assert.ok(result.ok);
  // Configura-se CONNECTION_UPDATE no webhook/set, mas chega connection.update.
  assert.equal(result.event.event, "connection.update");

  const rejected = parseEvolutionWebhook({
    ...(fixture("connection-update.open") as Record<string, unknown>),
    event: "CONNECTION_UPDATE",
  });
  assert.equal(rejected.ok, false);
});

test("qrcode.updated exposes the pairing code and has no sender", () => {
  const result = parseEvolutionWebhook(fixture("qrcode-updated"));
  assert.ok(result.ok);
  assert.equal(result.event.event, "qrcode.updated");
  assert.match(result.event.data.qrcode.code, /^2@/);
  // Ainda não há sessão quando o QR é emitido — envelope chega sem `sender`.
  assert.equal(result.event.sender, undefined);
});

test("groups.upsert carries an array payload", () => {
  const result = parseEvolutionWebhook(fixture("groups-upsert"));
  assert.ok(result.ok);
  assert.equal(result.event.event, "groups.upsert");
  assert.equal(result.event.data.length, 1);
  assert.equal(result.event.data[0].subject, "Teste Girumo");
});

test("group participants keep @lid ids without a real phone", () => {
  const result = parseEvolutionWebhook(fixture("group-participants-update.add"));
  assert.ok(result.ok);
  assert.equal(result.event.event, "group-participants.update");
  assert.equal(result.event.data.action, "add");
  assert.match(result.event.data.participants[0].id, /@lid$/);
});

test("unknown keys survive parsing so the worker can still read them", () => {
  const result = parseEvolutionWebhook(fixture("groups-upsert"));
  assert.ok(result.ok);
  assert.equal(result.event.event, "groups.upsert");
  // `owner` não é declarado no schema mas é usado pelo worker na F3/F4.
  assert.ok("owner" in result.event.data[0]);
});

test("malformed payloads are rejected without throwing", () => {
  const cases: unknown[] = [
    null,
    "not an object",
    {},
    { event: "unknown.event", instance: "gr_x", date_time: "2026-07-26T20:00:00Z" },
    // instance vazio
    { ...(fixture("messages-update") as Record<string, unknown>), instance: "" },
  ];

  for (const payload of cases) {
    const result = parseEvolutionWebhook(payload);
    assert.equal(result.ok, false, `deveria rejeitar: ${JSON.stringify(payload)?.slice(0, 40)}`);
  }
});

test("parse errors never leak the payload", () => {
  const result = parseEvolutionWebhook({
    ...(fixture("connection-update.open") as Record<string, unknown>),
    event: "nope",
  });
  assert.equal(result.ok, false);
  assert.ok(!result.error.includes("REDACTED-INSTANCE-TOKEN"));
});

test("stripCredentials removes the instance token", () => {
  const raw = fixture("connection-update.open") as Record<string, unknown>;
  assert.ok("apikey" in raw);
  const safe = stripCredentials(raw);
  assert.equal("apikey" in safe, false);
  // Não muta o original.
  assert.ok("apikey" in raw);
});

test("connection states map to instance status, unknown maps to null", () => {
  assert.equal(mapConnectionState("open"), "connected");
  assert.equal(mapConnectionState("connecting"), "connecting");
  assert.equal(mapConnectionState("close"), "disconnected");
  // Estado novo numa versão futura não pode virar 400 nem status errado.
  assert.equal(mapConnectionState("refused"), null);
});

test("phoneFromWuid extracts digits and rejects @lid", () => {
  assert.equal(phoneFromWuid("5511999990001@s.whatsapp.net"), "5511999990001");
  assert.equal(phoneFromWuid("20100000000000001@lid"), null);
  // Um @lid curto o bastante para parecer telefone ainda assim é rejeitado:
  // o domínio é o que decide, não o tamanho.
  assert.equal(phoneFromWuid("5511999990002@lid"), null);
  assert.equal(phoneFromWuid(null), null);
  assert.equal(phoneFromWuid(undefined), null);
});
