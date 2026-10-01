import assert from "node:assert/strict";
import { test } from "node:test";

import type { CampaignGroupOverview } from "@/lib/campaign-groups-overview";
import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import type { Group } from "@/lib/mock-data";
import {
  faixaDeLotacao,
  filtrarGrupos,
  hojeNaCampanha,
  ordenarGrupos,
  paraEntradaRecente,
  ultimasEntradas,
} from "./campanha-visao";

// qua 23/09/2026 14:10 em Brasília (UTC-3).
const agora = new Date("2026-09-23T17:10:00Z");
const br = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

function grupo(nome: string, membros: number, convite = true): CampaignGroupOverview {
  const g = { name: nome, members: membros, capacity: 1024, inviteUrl: convite ? "https://chat.whatsapp.com/x" : "" } as Group;
  return { id: nome, group: g, status: "available", members: membros, capacity: 1024, inviteUrl: g.inviteUrl ?? "" };
}

test("a faixa de lotação usa os limiares do painel: LOTOU a 95%, QUASE a 85%", () => {
  const grupos = [grupo("#1", 1024), grupo("#2", 973), grupo("#3", 900), grupo("#4", 64), grupo("#5", 10, false)];
  const semRegistro: CampaignGroupOverview = { id: "x", group: null, status: "unknown", members: 0, capacity: 0, inviteUrl: "" };
  assert.deepEqual(faixaDeLotacao([...grupos, semRegistro]), { lotados: 2, quase: 1, comVaga: 1, semConvite: 1, sumiram: 1 });
  assert.deepEqual(filtrarGrupos(grupos, "lotados").map((g) => g.id), ["#1", "#2"]);
  assert.deepEqual(filtrarGrupos(grupos, "com_vaga").map((g) => g.id), ["#4"]);
  assert.equal(filtrarGrupos(grupos, "todos").length, 5);
});

test("os grupos vêm do mais novo pro mais velho, pelo número", () => {
  assert.deepEqual(ordenarGrupos([grupo("VIP #9", 1), grupo("VIP #40", 1), grupo("VIP #10", 1)]).map((g) => g.id), ["VIP #40", "VIP #10", "VIP #9"]);
});

const leads = [
  { id: "a", name: "Daiane", sourceGroup: "VIP #40", sourceGroupId: "g40", enteredAt: br("2026-09-23", "12:05") },
  { id: "b", name: "Ana", sourceGroup: "VIP #40", sourceGroupId: "g40", enteredAt: br("2026-09-23", "12:40") },
  { id: "c", name: "Jéssica", sourceGroup: "VIP #39", sourceGroupId: "g39", enteredAt: br("2026-09-23", "09:30") },
  { id: "d", name: "Fora", sourceGroup: "Outro", sourceGroupId: "outro", enteredAt: br("2026-09-23", "10:00") },
  { id: "e", name: "Ontem", sourceGroup: "VIP #39", sourceGroupId: "g39", enteredAt: br("2026-09-22", "20:00") },
  { id: "f", name: "Semana", sourceGroup: "VIP #39", sourceGroupId: "g39", enteredAt: br("2026-09-16", "13:00") },
  { id: "g", name: "Semana tarde", sourceGroup: "VIP #39", sourceGroupId: "g39", enteredAt: br("2026-09-16", "16:00") },
];
const ids = ["g40", "g39"];

test("últimas entradas: só a campanha, a mais recente primeiro", () => {
  assert.deepEqual(ultimasEntradas(leads, ids, 3).map((l) => l.id), ["b", "a", "c"]);
});

test("a entrada que sai do servidor leva o nome abreviado e nada de telefone", () => {
  const lead = { id: "a", name: "Daiane Souza Lima", phone: "5511987654321", sourceGroup: "VIP #40", sourceGroupId: "g40", enteredAt: br("2026-09-23", "12:05") };
  // deepEqual estrito: uma chave a mais (phone, sourceGroupId) reprova.
  assert.deepEqual(paraEntradaRecente(lead), { id: "a", nome: "Daiane S.", grupo: "VIP #40", entrouEm: lead.enteredAt });
  assert.equal(paraEntradaRecente({ ...lead, name: null }).nome, "Alguém");
});

function post(extra: Partial<DispatchView>): DispatchView {
  return {
    id: "p",
    campaignId: "c",
    campaignSlug: "vip",
    type: "text",
    body: "Post",
    groupIds: [],
    mentionAll: false,
    recurrence: "none",
    status: "sent",
    sent: 0,
    total: 0,
    createdAt: br("2026-09-23", "06:00"),
    ...extra,
  };
}

test("o dia da campanha: saindo agora, o que saiu hoje e os próximos agendados", () => {
  const itens = hojeNaCampanha(
    [
      post({ id: "novidades", body: "NOVIDADES DO DIA\n40 modelos", status: "sent", sent: 39, total: 39, dispatchedAt: br("2026-09-23", "06:30") }),
      post({ id: "ontem", status: "sent", dispatchedAt: br("2026-09-22", "18:00") }),
      post({ id: "reposicao", body: "REPOSIÇÃO CHEGOU", status: "running", sent: 27, total: 40, runningSince: br("2026-09-23", "14:08") }),
      post({ id: "amanha", body: "Novidades do dia", status: "scheduled", scheduledAt: br("2026-09-24", "06:30"), recurrence: "daily" }),
      post({ id: "vencido", status: "scheduled", scheduledAt: br("2026-09-23", "08:00") }),
      post({ id: "rascunho", status: "draft" }),
    ],
    agora,
  );
  assert.deepEqual(
    itens.map((i) => [i.id, i.estado, i.hora]),
    [
      ["reposicao", "postando", "14:08"],
      ["novidades", "postado", "06:30"],
      ["amanha", "agendado", "amanhã 06:30"],
    ],
  );
  assert.equal(itens[1].texto, "NOVIDADES DO DIA", "a primeira linha do post vira o título");
});

test("o grupo aberto sozinho hoje entra no dia da campanha, na ordem da hora", () => {
  const itens = hojeNaCampanha(
    [
      post({ id: "novidades", status: "sent", dispatchedAt: br("2026-09-23", "06:30") }),
      post({ id: "reposicao", status: "running", runningSince: br("2026-09-23", "14:08") }),
    ],
    agora,
    2,
    [
      // O nome padrão do "abre outro" é "<campanha> {n}", sem "#": o apelido vem do seq.
      { nome: "VIP Revenda 40", seq: 40, grupo: "g40@g.us", quando: br("2026-09-23", "09:14") },
      { nome: "VIP Revenda 39", seq: 39, grupo: "g39@g.us", quando: br("2026-09-22", "22:30") },
    ],
  );
  // Mutantes: sem o filtro do dia, ou com o dia em UTC (22h30 de ontem em
  // Brasília já é hoje em UTC), o #39 de ontem apareceria no dia de hoje.
  assert.deepEqual(
    itens.map((i) => [i.estado, i.hora, i.texto]),
    [
      ["postando", "14:08", "Post"],
      ["grupo_aberto", "09:14", "#40 aberto sozinho"],
      ["postado", "06:30", "Post"],
    ],
  );
});
