import assert from "node:assert/strict";
import { test } from "node:test";

import type { CampaignGroupOverview } from "@/lib/campaign-groups-overview";
import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import type { EstadoGrupo } from "@/lib/groups/estado";
import type { Group } from "@/lib/mock-data";
import {
  filtrarGrupos,
  hojeNaCampanha,
  indiceDeEstados,
  ordenarGrupos,
  paraEntradaRecente,
  seloDaLinha,
  semEstruturaDeComunidade,
  ultimasEntradas,
} from "./campanha-visao";

// qua 23/09/2026 14:10 em Brasília (UTC-3).
const agora = new Date("2026-09-23T17:10:00Z");
const br = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

/** Uma linha da Visão geral: `id` é o que a campanha guarda em `groupIds` (o JID, aqui). */
function linha(jid: string, membros: number): CampaignGroupOverview {
  const g = { id: `uuid-${jid}`, whatsappGroupId: jid, name: jid, members: membros, capacity: 1024, inviteUrl: "https://chat.whatsapp.com/x" } as Group;
  return { id: jid, group: g, status: "available", members: membros, capacity: 1024, inviteUrl: g.inviteUrl ?? "" };
}

function estado(jid: string, posicao: number, e: EstadoGrupo["estado"], inviteUrl: string | null = "https://chat.whatsapp.com/x"): EstadoGrupo {
  return {
    posicao,
    groupId: `uuid-${jid}`,
    whatsappGroupId: jid,
    nome: jid,
    membros: 0,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado: e,
    podeReabrir: false,
    naRegra: { menos_enchendo: false, lotados: false, com_gente: false },
  };
}

const sumiu: CampaignGroupOverview = { id: "sumiu@g.us", group: null, status: "unknown", members: 0, capacity: 0, inviteUrl: "" };

test("o selo da linha é o estado do banco, não a porcentagem: lotado a 89% continua Lotado", () => {
  const porId = indiceDeEstados([
    estado("a@g.us", 1, "lotado"),
    estado("b@g.us", 2, "enchendo"),
    estado("c@g.us", 3, "fila"),
    estado("d@g.us", 4, "fila", null),
    estado("e@g.us", 5, "vazio", "convite-quebrado"),
    estado("f@g.us", 6, "lotado", null),
  ]);
  const selo = (l: CampaignGroupOverview) => seloDaLinha(l, porId.get(l.id));
  // 915 de 1024 = 89%: a regra antiga dizia "Com vaga"; o link pula este grupo.
  assert.equal(selo(linha("a@g.us", 915)), "lotado");
  // 1003 de 1024 = 98%: a regra antiga dizia "Lotou"; o banco diz que é ele que recebe.
  assert.equal(selo(linha("b@g.us", 1003)), "enchendo");
  assert.equal(selo(linha("c@g.us", 10)), "fila");
  // Sem convite que o link aceite, o link pula: fila e vazio avisam.
  assert.equal(selo(linha("d@g.us", 10)), "sem_convite");
  assert.equal(selo(linha("e@g.us", 1)), "sem_convite");
  // Lotado já não recebe ninguém: o convite não muda nada.
  assert.equal(selo(linha("f@g.us", 1000)), "lotado");
  assert.equal(selo(sumiu), "sumiu");
  // No /api/groups e fora do banco (sync entre as duas leituras): não chuta.
  assert.equal(selo(linha("z@g.us", 1000)), "sem_estado");
});

test("o banco decide antes da lista: grupo fora de /api/groups com estado mostra o estado", () => {
  const fora: CampaignGroupOverview = { ...sumiu, id: "fora@g.us" };
  assert.equal(seloDaLinha(fora, indiceDeEstados([estado("fora@g.us", 1, "lotado")]).get("fora@g.us")), "lotado");
});

test("pai e Avisos de comunidade saem da tabela em vez de virar \"Sumiu\"", () => {
  const avisos: CampaignGroupOverview = { ...sumiu, id: "avisos@g.us" };
  const grupos = [linha("a@g.us", 10), avisos, sumiu];
  assert.deepEqual(semEstruturaDeComunidade(grupos, ["avisos@g.us"]).map((g) => g.id), ["a@g.us", sumiu.id]);
  assert.equal(semEstruturaDeComunidade(grupos, []), grupos);
});

test("o índice é pelo JID, como o SQL cruza o pool: o uuid da linha não acha estado", () => {
  const porId = indiceDeEstados([estado("a@g.us", 1, "lotado")]);
  assert.equal(porId.get("a@g.us")?.estado, "lotado");
  assert.equal(porId.get("uuid-a@g.us"), undefined);
});

test("o filtro conta como a faixa do banco: fila sem convite entra em Na fila", () => {
  const porId = indiceDeEstados([estado("a@g.us", 1, "lotado"), estado("c@g.us", 2, "fila"), estado("d@g.us", 3, "fila", null)]);
  const grupos = [linha("a@g.us", 915), linha("c@g.us", 10), linha("d@g.us", 10), sumiu];
  assert.deepEqual(filtrarGrupos(grupos, "lotado", porId).map((g) => g.id), ["a@g.us"]);
  assert.deepEqual(filtrarGrupos(grupos, "fila", porId).map((g) => g.id), ["c@g.us", "d@g.us"]);
  assert.deepEqual(filtrarGrupos(grupos, "enchendo", porId), []);
  assert.equal(filtrarGrupos(grupos, "todos", porId).length, 4);
});

test("as linhas vêm na ordem do pool, como a aba Grupos e o link; sem estado vão para o fim", () => {
  const porId = indiceDeEstados([estado("VIP #40", 3, "fila"), estado("VIP #9", 1, "lotado"), estado("VIP #10", 2, "enchendo")]);
  const grupos = [linha("VIP #40", 1), sumiu, linha("VIP #10", 1), linha("VIP #9", 1), linha("novo", 1)];
  assert.deepEqual(ordenarGrupos(grupos, porId).map((g) => g.id), ["VIP #9", "VIP #10", "VIP #40", "sumiu@g.us", "novo"]);
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
