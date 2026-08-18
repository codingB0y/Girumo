import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBackfillRun, BACKFILL_RUN_EVENT } from "./backfill-run-log";

const zero = { filled: 0, failed: 0, skipped: 0, remaining: 0 };
const run = (over: Partial<Parameters<typeof summarizeBackfillRun>[0]> = {}) =>
  summarizeBackfillRun({
    tenantsSeen: 1,
    processedInstances: 1,
    results: zero,
    breakerTrips: [],
    ...over,
  });

test("run saudável é info e diz quanto falta", () => {
  const r = run({ results: { filled: 10, failed: 0, skipped: 0, remaining: 155 } });
  assert.equal(r.level, "info");
  assert.equal(r.event, BACKFILL_RUN_EVENT);
  assert.match(r.message, /preencheu 10/);
  assert.match(r.message, /restam 155/);
});

test("falha isolada de grupo não vira alerta se algum convite entrou", () => {
  // Falha de um grupo é rotina: perdeu admin, convite revogado. O que importa
  // é que a instância provou que responde.
  const r = run({ results: { filled: 8, failed: 2, skipped: 1, remaining: 40 } });
  assert.equal(r.level, "info");
});

test("disjuntor aberto é o alerta mais alto, acima de tudo", () => {
  // O caso de 14/08/2026: zero preenchidos e nenhum rastro do porquê.
  const r = run({
    processedInstances: 0,
    results: { filled: 0, failed: 3, skipped: 3, remaining: 155 },
    breakerTrips: [{ tenantId: "t1", reason: "404 generico da Evolution" }],
  });
  assert.equal(r.level, "warn");
  assert.match(r.message, /Disjuntor abriu em 1 tenant/);
  // Vence o "nenhuma instância conectada", que também casaria aqui.
  assert.doesNotMatch(r.message, /Nenhuma instância conectada/);
  assert.match(r.message, /404 generico da Evolution/);
});

test("deploy inerte não se confunde com run saudável sem fila", () => {
  // Sem isto, env errada ou sessão morta responde igual a "não havia nada a fazer".
  const r = run({ tenantsSeen: 4, processedInstances: 0 });
  assert.equal(r.level, "warn");
  assert.match(r.message, /Nenhuma instância conectada em 4 tenant/);
});

test("instância viva com fila e zero convites é o estrago silencioso", () => {
  const r = run({ results: { filled: 0, failed: 0, skipped: 7, remaining: 12 } });
  assert.equal(r.level, "warn");
  assert.match(r.message, /nenhum convite preenchido/);
  assert.match(r.message, /adiados=7/);
});

test("run sem fila e sem falha nenhuma continua info", () => {
  // filled=0 sozinho não é problema: a fila pode ter acabado.
  const r = run();
  assert.equal(r.level, "info");
});

test("metadata carrega os contadores para dar pra plotar depois", () => {
  const r = run({
    tenantsSeen: 3,
    processedInstances: 2,
    results: { filled: 10, failed: 1, skipped: 2, remaining: 99 },
  });
  assert.deepEqual(r.metadata, {
    tenants_seen: 3,
    processed_instances: 2,
    filled: 10,
    failed: 1,
    skipped: 2,
    remaining: 99,
    breaker_trips: 0,
  });
});

test("sem disjuntor não existe breaker_detail no metadata", () => {
  assert.equal("breaker_detail" in run().metadata, false);
  const comTrip = run({ breakerTrips: [{ tenantId: "t9", reason: "x" }] });
  assert.deepEqual(comTrip.metadata.breaker_detail, [{ tenant_id: "t9", reason: "x" }]);
});
