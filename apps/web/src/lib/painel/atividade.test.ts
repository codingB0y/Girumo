import assert from "node:assert/strict";
import { test } from "node:test";

import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  diaPorExtenso,
  janelasDaAtividade,
  marcasDeGrupoAberto,
  marcasDePost,
  marcasDeRelampago,
  mostraRotulo,
  nomeDoMes,
  semanaPassadaMedida,
  somaDa,
  somaMedida,
  tetoDoEixo,
  variacao,
  type AtividadeDaCampanha,
  type PontoDaSerie,
} from "./atividade";

// qua 23/09/2026 14:10 em Brasília (UTC-3).
const agora = new Date("2026-09-23T17:10:00Z");
const br = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString();
const iso = (d: Date) => d.toISOString();

test("as janelas saem do dia de Brasília: hoje por hora, o mês por dia e a semana passada até agora", () => {
  const j = janelasDaAtividade(agora);
  assert.deepEqual([iso(j.porHora.de), iso(j.porHora.ate), j.porHora.fatia], ["2026-09-23T03:00:00.000Z", "2026-09-24T03:00:00.000Z", "hour"]);
  assert.deepEqual([iso(j.porDia.de), iso(j.porDia.ate), j.porDia.fatia], ["2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z", "day"]);
  assert.deepEqual(
    [iso(j.semanaPassada.de), iso(j.semanaPassada.ate)],
    ["2026-09-16T03:00:00.000Z", "2026-09-16T17:10:00.000Z"],
    "a semana passada vai até o mesmo minuto: dia parcial contra dia parcial",
  );
});

test("no começo do mês os dias recuam até 6 dias atrás; em dezembro o fim vira o ano", () => {
  const outubro = janelasDaAtividade(new Date("2026-10-02T15:00:00Z"));
  assert.deepEqual([iso(outubro.porDia.de), iso(outubro.porDia.ate)], ["2026-09-26T03:00:00.000Z", "2026-11-01T03:00:00.000Z"]);
  const dezembro = janelasDaAtividade(new Date("2026-12-20T15:00:00Z"));
  assert.equal(iso(dezembro.porDia.ate), "2027-01-01T03:00:00.000Z");
});

test("às 23h30 de Brasília o dia ainda não virou, mesmo com o UTC já no dia seguinte", () => {
  const j = janelasDaAtividade(new Date(br("2026-09-30", "23:30")));
  assert.equal(iso(j.porHora.de), "2026-09-30T03:00:00.000Z");
  assert.equal(iso(j.porDia.ate), "2026-10-01T03:00:00.000Z");
});

/**
 * Série do banco: um ponto por hora (ou dia) a partir de `de`, com os valores
 * dados como [novas, cliques, entraram, saíram].
 */
function serie(de: string, passoMs: number, n: number, valores: Record<number, number[]> = {}): PontoDaSerie[] {
  return Array.from({ length: n }, (_, i) => ({
    inicio: new Date(Date.parse(de) + i * passoMs).toISOString(),
    novas: valores[i]?.[0] ?? 0,
    cliques: valores[i]?.[1] ?? 0,
    entraram: valores[i]?.[2] ?? 0,
    sairam: valores[i]?.[3] ?? 0,
  }));
}

const HORA = 3_600_000;
const DIA = 86_400_000;

const atividade: AtividadeDaCampanha = {
  geradoEm: agora.toISOString(),
  // Medição de entradas e saídas desde segunda 21/09 às 10h.
  entradasDesde: "2026-09-21T13:00:00.000Z",
  porHora: serie("2026-09-23T03:00:00Z", HORA, 24, { 9: [1, 4, 6, 1], 12: [2, 7, 9, 2] }),
  porDia: serie("2026-09-01T03:00:00Z", DIA, 30, { 19: [0, 0, 5, 5], 20: [0, 0, 4, 1], 21: [1, 0, 7, 0], 22: [3, 11, 15, 3] }),
  semanaPassada: { novas: 1, cliques: 5, entraram: 0, sairam: 0 },
  hojePorGrupo: {},
  gruposAbertosHoje: [],
};

test("por hora: a hora em curso é 'agora', a que não chegou é futuro, e cada medida lê a sua coluna", () => {
  const novas = barrasDaAtividade(atividade, "hoje", "novas");
  assert.equal(novas.length, 24);
  assert.deepEqual([novas[9].rotulo, novas[9].valor, novas[12].valor], ["09h", 1, 2]);
  assert.deepEqual([novas[14].rotulo, novas[14].atual, novas[14].futuro], ["agora", true, false]);
  assert.equal(novas[15].futuro, true);
  assert.equal(novas[13].futuro, false);
  assert.equal(novas[12].rotuloLongo, "12h às 12h59");
  assert.equal(barrasDaAtividade(atividade, "hoje", "cliques")[12].valor, 7);
});

test("7 dias terminam hoje e rotulam o dia da semana", () => {
  const barras = barrasDaAtividade(atividade, "7d", "novas");
  assert.deepEqual(barras.map((b) => b.rotulo), ["qui 17", "sex 18", "sáb 19", "dom 20", "seg 21", "ter 22", "hoje"]);
  assert.deepEqual(barras.map((b) => b.valor), [0, 0, 0, 0, 0, 1, 3]);
  assert.ok(barras.every((b) => !b.futuro));
});

test("o eixo dos 7 dias escreve todos os dias; nas 24 horas, o vizinho de agora fica sem rótulo", () => {
  const dias = barrasDaAtividade(atividade, "7d", "novas");
  // Mutante: esconder o vizinho de "hoje" também aqui apagava o "ter 22" (o ontem).
  assert.deepEqual(
    dias.filter((_, i) => mostraRotulo(dias, i, 1)).map((b) => b.rotulo),
    ["qui 17", "sex 18", "sáb 19", "dom 20", "seg 21", "ter 22", "hoje"],
  );
  // Às 14h10, "agora" é a barra das 14h: o "15h" encostaria nele e sai; o "12h" fica.
  const horas = barrasDaAtividade(atividade, "hoje", "novas");
  assert.deepEqual(
    horas.filter((_, i) => mostraRotulo(horas, i, 3)).map((b) => b.rotulo),
    ["00h", "03h", "06h", "09h", "12h", "agora", "18h", "21h"],
  );
});

test("o mês mostra o mês inteiro: rótulo em 1, 5, 10…, hoje aceso e o resto do mês por vir", () => {
  const barras = barrasDaAtividade(atividade, "mes", "novas");
  assert.equal(barras.length, 30);
  assert.deepEqual(barras.slice(0, 5).map((b) => b.rotulo), ["1", "", "", "", "5"]);
  assert.deepEqual([barras[22].rotulo, barras[22].atual, barras[22].valor], ["hoje", true, 3]);
  assert.equal(barras[23].futuro, true);
  assert.equal(barras[21].futuro, false);
});

test("no começo do mês, 7 dias atravessam a virada e o mês só tem o mês novo", () => {
  const outubro: AtividadeDaCampanha = {
    geradoEm: "2026-10-02T15:00:00Z",
    entradasDesde: "2026-09-01T03:00:00.000Z",
    porHora: serie("2026-10-02T03:00:00Z", HORA, 24),
    porDia: serie("2026-09-26T03:00:00Z", DIA, 36),
    semanaPassada: { novas: 0, cliques: 0, entraram: 0, sairam: 0 },
    hojePorGrupo: {},
    gruposAbertosHoje: [],
  };
  assert.deepEqual(
    barrasDaAtividade(outubro, "7d", "novas").map((b) => b.rotulo),
    ["sáb 26", "dom 27", "seg 28", "ter 29", "qua 30", "qui 1", "hoje"],
  );
  const mes = barrasDaAtividade(outubro, "mes", "novas");
  assert.equal(mes.length, 31);
  assert.equal(mes[0].chave, "2026-10-01");
});

test("entradas e saídas: antes da medição a barra é 'sem medição', nunca zero, e a soma só conta o medido", () => {
  // Medição desde seg 21/09 às 10h: de qui 17 a dom 20 não há o que medir, e a
  // seg 21, medida só das 10h em diante, não entra como dia inteiro.
  const dias = barrasDaAtividade(atividade, "7d", "entraram", "sairam");
  assert.deepEqual(dias.map((b) => b.semMedicao), [true, true, true, true, true, false, false]);
  assert.deepEqual(
    dias.slice(5).map((b) => [b.valor, b.abaixo]),
    [
      [7, 0],
      [15, 3],
    ],
  );
  // Mutantes: somar a seg 21 (4 e 1, só desde as 10h) daria 26 e 4; somar também o domingo, 31 e 9.
  assert.deepEqual(somaMedida(dias), { entraram: 22, sairam: 3 });
  // À meia-noite em ponto, o dia conta inteiro.
  const desdeMeiaNoite = { ...atividade, entradasDesde: "2026-09-21T03:00:00.000Z" };
  assert.equal(barrasDaAtividade(desdeMeiaNoite, "7d", "entraram")[4].semMedicao, false);

  const horas = barrasDaAtividade(atividade, "hoje", "entraram", "sairam");
  assert.ok(horas.every((b) => !b.semMedicao), "hoje inteiro já era medido");
  assert.deepEqual(somaMedida(horas), { entraram: 15, sairam: 3 });
});

test("a hora em que a medição começou conta; as de antes e o dia começado pela metade, não", () => {
  const comecouHoje = { ...atividade, entradasDesde: br("2026-09-23", "10:20") };
  const horas = barrasDaAtividade(comecouHoje, "hoje", "entraram", "sairam");
  assert.equal(horas[9].semMedicao, true, "09h às 09h59 terminou antes das 10h20");
  assert.equal(horas[10].semMedicao, false, "10h às 10h59 já tem medição a partir das 10h20");
  assert.deepEqual(somaMedida(horas), { entraram: 9, sairam: 2 });
  // O dia, não: começou às 10h20, então hoje fica fora dos 7 dias.
  assert.equal(barrasDaAtividade(comecouHoje, "7d", "entraram").at(-1)?.semMedicao, true);
  // Novas pessoas e cliques não dependem desta medição.
  assert.ok(barrasDaAtividade(comecouHoje, "hoje", "cliques").every((b) => !b.semMedicao));
  assert.ok(barrasDaAtividade(comecouHoje, "7d", "novas").every((b) => !b.semMedicao));
});

test("a comparação de entradas com a semana passada só vale quando aquele dia já era medido", () => {
  assert.equal(semanaPassadaMedida(atividade), false, "qua 16 foi antes de seg 21");
  assert.equal(semanaPassadaMedida({ ...atividade, entradasDesde: "2026-09-16T03:00:00.000Z" }), true);
  assert.equal(semanaPassadaMedida({ ...atividade, entradasDesde: "2026-09-16T13:00:00.000Z" }), false, "medido só a partir das 10h não compara o dia");
});

test("somas, variação e teto do eixo", () => {
  assert.equal(somaDa(atividade.porHora, "novas"), 3);
  assert.equal(somaDa(atividade.porHora, "cliques"), 11);
  assert.equal(variacao(3, 1), 200);
  assert.equal(variacao(3, 0), null, "sem base não há porcentagem");
  assert.equal(tetoDoEixo(0), 5);
  assert.equal(tetoDoEixo(3), 5);
  assert.equal(tetoDoEixo(42), 50);
  assert.equal(tetoDoEixo(100), 100);
  assert.equal(tetoDoEixo(101), 200);
});

test("datas por extenso para o cabeçalho da análise", () => {
  assert.equal(diaPorExtenso("2026-09-23"), "quarta, 23 de setembro");
  assert.equal(nomeDoMes("2026-09-23"), "Setembro");
});

test("o dia da semana passada concorda em gênero: sábado e domingo são masculinos", () => {
  assert.equal(diaDaSemanaPassada("2026-09-23"), "quarta passada");
  assert.equal(diaDaSemanaPassada("2026-09-23", true), "na quarta passada");
  assert.equal(diaDaSemanaPassada("2026-09-26", true), "no sábado passado");
  assert.equal(diaDaSemanaPassada("2026-09-27"), "domingo passado");
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

test("as marcas são os posts que saíram hoje, na hora e no minuto em que saíram", () => {
  const marcas = marcasDePost(
    [
      post({ id: "reposicao", body: "REPOSIÇÃO CHEGOU", status: "running", runningSince: br("2026-09-23", "14:08") }),
      post({ id: "novidades", body: "NOVIDADES DO DIA\n40 modelos", status: "sent", dispatchedAt: br("2026-09-23", "06:30") }),
      post({ id: "falhou", status: "failed", dispatchedAt: br("2026-09-23", "10:00") }),
      post({ id: "ontem", status: "sent", dispatchedAt: br("2026-09-22", "18:00") }),
      post({ id: "amanha", status: "scheduled", scheduledAt: br("2026-09-24", "06:30") }),
    ],
    agora,
  );
  assert.deepEqual(
    marcas.map((m) => [m.id, m.hora, m.texto]),
    [
      ["novidades", "06:30", "NOVIDADES DO DIA"],
      ["reposicao", "14:08", "REPOSIÇÃO CHEGOU"],
    ],
  );
  assert.equal(marcas[0].posicao, (6 * 60 + 30) / 1440);
});

test("na loja inteira o grupo aberto leva o nome, porque o número se repete entre campanhas", () => {
  const g = { nome: "VIP Revenda 40", seq: 40, grupo: "g40@g.us", quando: "2026-10-02T12:14:00.000Z" };
  assert.equal(marcasDeGrupoAberto([g], { comNome: true })[0].texto, "VIP Revenda 40 aberto");
  assert.equal(marcasDeGrupoAberto([g])[0].texto, "#40 aberto");
});

test("o grupo aberto sozinho vira marca no minuto em que passou a existir, pelo número", () => {
  const marcas = marcasDeGrupoAberto([
    { nome: "Mega Stock Atacado 40", seq: 40, grupo: "g40@g.us", quando: br("2026-09-23", "09:14") },
    // Molde sem número no nome: o "abre outro" acrescenta o seq no fim, e o apelido segue.
    { nome: "Grupo da Loja 41", seq: 41, grupo: null, quando: br("2026-09-23", "11:00") },
  ]);
  assert.deepEqual(
    marcas.map((m) => [m.hora, m.texto]),
    [
      ["09:14", "#40 aberto"],
      ["11:00", "#41 aberto"],
    ],
  );
  assert.equal(marcas[0].posicao, (9 * 60 + 14) / 1440);
});

const oferta = (id: string, opened_at: string | null) => ({
  id,
  tenant_id: "t",
  name: id,
  keyword: "EU QUERO",
  slots: 5,
  timer_seconds: null,
  status: "open" as const,
  opened_at,
  closed_at: null,
  created_at: opened_at ?? br("2026-09-23", "00:00"),
  broadcast_id: null,
});

test("a relâmpago aberta hoje vira marca na hora em que abriu; de ontem ou sem abertura, não", () => {
  const marcas = marcasDeRelampago(
    [
      oferta("tarde", br("2026-09-23", "13:45")),
      oferta("manha", br("2026-09-23", "09:05")),
      oferta("ontem", br("2026-09-22", "23:50")),
      oferta("rascunho", null),
    ],
    agora,
  );
  assert.deepEqual(
    marcas.map((m) => [m.id, m.hora, m.texto]),
    [
      ["relampago:manha", "09:05", "Relâmpago no ar"],
      ["relampago:tarde", "13:45", "Relâmpago no ar"],
    ],
  );
  assert.equal(marcas[0].posicao, (9 * 60 + 5) / 1440);
});
