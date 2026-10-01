import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { movimentoDeMembros } from "./member-events";

const fixture = (nome: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src", "lib", "evolution", "__fixtures__", nome), "utf8"));

test("o aviso real de saída vira uma saída, com o @lid e o minuto em que chegou", () => {
  const evento = fixture("group-participants-update.remove.json");
  // Não o date_time do aviso: a Evolution manda a hora de Brasília com "Z".
  const chegou = new Date("2026-10-01T02:22:25.947Z");
  assert.deepEqual(movimentoDeMembros(evento.data.action, evento.data.participants, chegou), {
    kind: "leave",
    participants: ["20100000000000001@lid"],
    occurredAt: "2026-10-01T02:22:00.000Z",
  });
});

test("o aviso real de entrada vira uma entrada", () => {
  const evento = fixture("group-participants-update.add.json");
  const movimento = movimentoDeMembros(evento.data.action, evento.data.participants);
  assert.equal(movimento?.kind, "join");
  assert.ok((movimento?.participants.length ?? 0) > 0);
});

test("promote e demote trocam o papel, não quem está no grupo", () => {
  const p = [{ id: "1@lid" }];
  assert.equal(movimentoDeMembros("promote", p), null);
  assert.equal(movimentoDeMembros("demote", p), null);
  assert.equal(movimentoDeMembros("ADD", p)?.kind, "join", "a ação vem em qualquer caixa");
});

test("a mesma pessoa repetida no lote conta uma vez, e id vazio não conta", () => {
  const movimento = movimentoDeMembros("add", [{ id: "1@lid" }, { id: "1@lid" }, { id: " " }, { id: null }, { id: "2@lid" }]);
  assert.deepEqual(movimento?.participants, ["1@lid", "2@lid"]);
  assert.equal(movimentoDeMembros("add", [{ id: "" }]), null);
  assert.equal(movimentoDeMembros("add", []), null);
});

test("dois números da loja no mesmo minuto caem no mesmo horário", () => {
  const a = movimentoDeMembros("add", [{ id: "1@lid" }], new Date("2026-09-29T14:08:01.120Z"));
  const b = movimentoDeMembros("add", [{ id: "1@lid" }], new Date("2026-09-29T14:08:01.874Z"));
  assert.equal(a?.occurredAt, "2026-09-29T14:08:00.000Z");
  assert.equal(a?.occurredAt, b?.occurredAt);
});
