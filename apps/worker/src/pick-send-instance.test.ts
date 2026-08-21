import assert from "node:assert/strict";
import { test } from "node:test";
import { pickSendInstance, type InstanceRow } from "./pick-send-instance.js";

function inst(over: Partial<InstanceRow> = {}): InstanceRow {
  return {
    id: "i-1",
    status: "connected",
    provider_instance_id: "girumo-i-1",
    created_at: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

test("tenant sem instancia nenhuma devolve null", () => {
  assert.equal(pickSendInstance([]), null);
});

// Sem provider_instance_id o envio falharia em instanceName(); enfileirar para
// essa instancia so troca "preso na fila" por "falha adiante".
test("instancia sem provider_instance_id nao serve", () => {
  assert.equal(pickSendInstance([inst({ provider_instance_id: null })]), null);
});

test("escolhe a unica instancia provisionada", () => {
  assert.equal(pickSendInstance([inst({ id: "i-9" })]), "i-9");
});

test("prefere a conectada quando ha escolha", () => {
  const escolhida = pickSendInstance([
    inst({ id: "caida", status: "disconnected", created_at: "2026-07-01T00:00:00.000Z" }),
    inst({ id: "viva", status: "connected", created_at: "2026-08-01T00:00:00.000Z" }),
  ]);
  assert.equal(escolhida, "viva");
});

// Instancia que caiu tende a voltar; comando esperando na fila e melhor que run
// falhando. Este foi o caso real de 19/08 antes do fix: 1 instancia, comando preso.
test("sem nenhuma conectada ainda escolhe uma provisionada", () => {
  const escolhida = pickSendInstance([
    inst({ id: "qr", status: "qr" }),
    inst({ id: "off", status: "disconnected", created_at: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.equal(escolhida, "off");
});

test("desempata pela mais antiga, para a escolha ser estavel entre ciclos", () => {
  const rows = [
    inst({ id: "nova", created_at: "2026-08-10T00:00:00.000Z" }),
    inst({ id: "antiga", created_at: "2026-06-01T00:00:00.000Z" }),
  ];
  assert.equal(pickSendInstance(rows), "antiga");
  assert.equal(pickSendInstance([...rows].reverse()), "antiga", "ordem de entrada nao muda o resultado");
});

test("mesma data desempata pelo id, sem depender da ordem do banco", () => {
  const rows = [inst({ id: "b" }), inst({ id: "a" })];
  assert.equal(pickSendInstance(rows), "a");
});

test("nao muta o array recebido", () => {
  const rows = [inst({ id: "z", created_at: "2026-09-01T00:00:00.000Z" }), inst({ id: "a" })];
  const antes = rows.map((r) => r.id).join(",");
  pickSendInstance(rows);
  assert.equal(rows.map((r) => r.id).join(","), antes);
});
