import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { movimentoDeMembros } from "./member-events";

const fixture = (nome: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "lib", "evolution", "__fixtures__", nome), "utf8"));

test("o aviso real de saída vira uma saída, com o @lid e o minuto do aviso", () => {
  const evento = fixture("group-participants-update.remove.json");
  assert.deepEqual(movimentoDeMembros(evento.data.action, evento.data.participants, evento.date_time), {
    kind: "leave",
    participants: ["20100000000000001@lid"],
    occurredAt: "2026-07-26T20:50:00.000Z",
  });
});

test("o aviso real de entrada vira uma entrada", () => {
  const evento = fixture("group-participants-update.add.json");
  const movimento = movimentoDeMembros(evento.data.action, evento.data.participants, evento.date_time);
  assert.equal(movimento?.kind, "join");
  assert.ok((movimento?.participants.length ?? 0) > 0);
});

test("promote e demote trocam o papel, não quem está no grupo", () => {
  const p = [{ id: "1@lid" }];
  assert.equal(movimentoDeMembros("promote", p, "2026-09-29T12:00:00Z"), null);
  assert.equal(movimentoDeMembros("demote", p, "2026-09-29T12:00:00Z"), null);
  assert.equal(movimentoDeMembros("ADD", p, "2026-09-29T12:00:00Z")?.kind, "join", "a ação vem em qualquer caixa");
});

test("a mesma pessoa repetida no lote conta uma vez, e id vazio não conta", () => {
  const movimento = movimentoDeMembros("add", [{ id: "1@lid" }, { id: "1@lid" }, { id: " " }, { id: null }, { id: "2@lid" }], "2026-09-29T12:00:00Z");
  assert.deepEqual(movimento?.participants, ["1@lid", "2@lid"]);
  assert.equal(movimentoDeMembros("add", [{ id: "" }], "2026-09-29T12:00:00Z"), null);
  assert.equal(movimentoDeMembros("add", [], "2026-09-29T12:00:00Z"), null);
});

test("dois números da loja no mesmo minuto caem no mesmo horário", () => {
  const a = movimentoDeMembros("add", [{ id: "1@lid" }], "2026-09-29T14:08:01.120Z");
  const b = movimentoDeMembros("add", [{ id: "1@lid" }], "2026-09-29T14:08:01.874Z");
  assert.equal(a?.occurredAt, "2026-09-29T14:08:00.000Z");
  assert.equal(a?.occurredAt, b?.occurredAt);
});

test("horário que não parseia vira o minuto de agora", () => {
  const agora = new Date("2026-09-29T17:10:42Z");
  assert.equal(movimentoDeMembros("remove", [{ id: "1@lid" }], "ontem", agora)?.occurredAt, "2026-09-29T17:10:00.000Z");
});
