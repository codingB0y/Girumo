import assert from "node:assert/strict";
import { test } from "node:test";

import type { EntregaNoGrupo, ResumoDaEntrega } from "@/lib/painel/entrega";
import type { Group } from "@/lib/mock-data";
import { gradeDaEntrega, proximosAgendamentos, rotuloDaCelula, terminaPorVolta } from "./postando";

const CONVITE = "https://chat.whatsapp.com/abc";

function grupo(id: string, name: string): Group {
  return { id, name, whatsappGroupId: `${id}@g.us`, members: 100, capacity: 1000, selected: false, engagement: "medio", inviteUrl: CONVITE };
}

function resumo(p: Partial<ResumoDaEntrega>): ResumoDaEntrega {
  return { entregues: 0, postando: 0, naFila: 0, falharam: 0, cancelados: 0, total: 0, ...p };
}

// 14:10:00 em Brasília (UTC-3).
const AGORA = new Date("2026-10-03T17:10:00Z");

test("termina por volta de agora + restantes x 6 s, em hora de Brasília", () => {
  // 13 x 6 s = 78 s -> 14:11:18
  assert.equal(terminaPorVolta(resumo({ postando: 1, naFila: 12, total: 20 }), AGORA), "14:11");
});

test("termina por volta vira null quando nada resta", () => {
  assert.equal(terminaPorVolta(resumo({ entregues: 5, falharam: 1, total: 6 }), AGORA), null);
});

test("grade ordena pelo numero do grupo, depois os sem numero pelo nome, e o fora do cadastro por ultimo", () => {
  const grupos = [grupo("a", "X 2"), grupo("b", "X 10"), grupo("c", "X 9"), grupo("d", "Clientes antigos")];
  const entrega: EntregaNoGrupo[] = [
    { grupo: "fantasma@g.us", estado: "falhou", quando: null },
    { grupo: "d@g.us", estado: "na_fila", quando: null },
    { grupo: "b@g.us", estado: "postando", quando: null },
    { grupo: "a@g.us", estado: "entregue", quando: "2026-10-03T17:08:00Z" },
    { grupo: "c@g.us", estado: "na_fila", quando: null },
  ];
  const grade = gradeDaEntrega(entrega, grupos);
  assert.deepEqual(grade.map((c) => c.rotulo), ["#2", "#9", "#10", "4º", "5º"]);
  assert.deepEqual(grade.map((c) => c.nome), ["X 2", "X 9", "X 10", "Clientes antigos", "fantasma@g.us"]);
  assert.equal(grade[0].estado, "entregue");
  assert.equal(grade[0].quando, "2026-10-03T17:08:00Z");
  assert.equal(grade[0].id, "a@g.us");
});

test("proximos agendamentos: so pendentes futuros, em ordem, ate o limite", () => {
  const lista = [
    { id: "longe", campaignName: "Longe", scheduledAt: "2026-10-06T12:00:00Z", status: "pending" },
    { id: "passado", campaignName: "Passado", scheduledAt: "2026-10-03T12:00:00Z", status: "pending" },
    { id: "feito", campaignName: "Feito", scheduledAt: "2026-10-03T21:00:00Z", status: "done" },
    { id: "amanha", campaignName: "Amanhã", scheduledAt: "2026-10-04T09:30:00Z", status: "pending" },
    { id: "hoje", scheduledAt: "2026-10-03T22:00:00Z", status: "pending" },
    { id: "sem-data", campaignName: "Sem data", status: "pending" },
  ];
  const proximos = proximosAgendamentos(lista, AGORA);
  assert.deepEqual(proximos.map((p) => p.quando), ["19:00", "amanhã 06:30", "06/10 09:00"]);
  assert.deepEqual(proximos.map((p) => p.nome), ["Post agendado", "Amanhã", "Longe"]);
  assert.deepEqual(proximos.map((p) => p.id), ["hoje", "amanha", "longe"]);
  assert.equal(proximosAgendamentos(lista, AGORA, 2).length, 2);
});

test("rotulo da celula diz o estado por extenso e nao repete o nome igual ao rotulo", () => {
  const base = { id: "a@g.us", rotulo: "#3", nome: "Moda Sul 03", quando: null };
  assert.equal(rotuloDaCelula({ ...base, estado: "entregue", quando: "2026-10-03T17:08:00Z" }), "#3, Moda Sul 03: entregue às 14:08");
  assert.equal(rotuloDaCelula({ ...base, estado: "postando" }), "#3, Moda Sul 03: postando");
  assert.equal(rotuloDaCelula({ ...base, estado: "na_fila" }), "#3, Moda Sul 03: na fila");
  assert.equal(rotuloDaCelula({ ...base, estado: "falhou" }), "#3, Moda Sul 03: falhou");
  assert.equal(rotuloDaCelula({ ...base, estado: "cancelado" }), "#3, Moda Sul 03: cancelado");
  assert.equal(rotuloDaCelula({ ...base, nome: "#3", estado: "na_fila" }), "#3: na fila");
});
