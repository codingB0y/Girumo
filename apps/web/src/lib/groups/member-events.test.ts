import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { movimentoDeMembros, temSaidaVoluntaria } from "./member-events";

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

test("saída voluntária: o autor do remove é o próprio participante", () => {
  // Formato medido em prod (23/10/2026), com ids falsos: author = id do participante, em @lid.
  const p = [{ id: "20100000000000009@lid", phoneNumber: "5511999990009@s.whatsapp.net", admin: null }];
  assert.equal(temSaidaVoluntaria("remove", p, "20100000000000009@lid"), true);
});

test("remoção por admin (o aviso real da fixture) não é saída voluntária", () => {
  const evento = fixture("group-participants-update.remove.json");
  assert.equal(temSaidaVoluntaria(evento.data.action, evento.data.participants, evento.data.author), false);
});

test("sem autor, entrada ou promote não contam como saída voluntária", () => {
  const p = [{ id: "1@lid" }];
  assert.equal(temSaidaVoluntaria("remove", p, null), false);
  assert.equal(temSaidaVoluntaria("remove", p, ""), false);
  assert.equal(temSaidaVoluntaria("add", p, "1@lid"), false);
  assert.equal(temSaidaVoluntaria("promote", p, "1@lid"), false);
});
