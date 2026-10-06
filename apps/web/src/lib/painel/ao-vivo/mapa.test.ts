import assert from "node:assert/strict";
import { test } from "node:test";

import type { Group } from "@/lib/mock-data";
import {
  CELULAS_POR_BLOCO_NO_LIMITE,
  celulasDoFiltro,
  entradaNaCelula,
  larguraDoBloco,
  lugaresDosBlocos,
  MAX_ALERTAS,
  montarMapa,
  novoDoBloco,
  preenchimentoDaCelula,
  resumoDoBloco,
  rotuloAcessivel,
  rotuloNaCelula,
  type BlocoDoMapa,
  type CampanhaDoMapa,
} from "./mapa";

/** O que o bloco mostra com o filtro "Todos". */
const vis = (b: BlocoDoMapa) => celulasDoFiltro(b, "todos");

const CONVITE = "https://chat.whatsapp.com/abc";

function grupo(id: string, p: Partial<Group> = {}): Group {
  return { id, name: `VIP #${id}`, whatsappGroupId: `${id}@g.us`, members: 100, capacity: 1000, selected: false, engagement: "medio", inviteUrl: CONVITE, ...p };
}

const vip: CampanhaDoMapa = { id: "c-vip", name: "VIP Revenda", slug: "vip", groupIds: ["40@g.us", "39@g.us", "2@g.us"], autoGrow: true };

test("agrupa por campanha, ordena pelo número do grupo e põe os fora de campanha em Outros grupos", () => {
  const mapa = montarMapa({
    grupos: [grupo("40"), grupo("2"), grupo("39"), grupo("solto", { name: "Clientes antigos" })],
    campanhas: [vip],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(mapa.blocos.map((b) => b.titulo), ["VIP Revenda", "Outros grupos"]);
  assert.deepEqual(vis(mapa.blocos[0]).celulas.map((c) => c.rotulo), ["#2", "#39", "#40"]);
  assert.equal(mapa.blocos[0].href, "/painel/campanhas/vip");
  assert.equal(mapa.blocos[0].autoGrow, true);
  assert.equal(mapa.blocos[1].href, "/painel/grupos");
  assert.equal(mapa.blocos[1].autoGrow, null);
  // Sem número no nome nem displayNumber: a posição no bloco.
  assert.equal(vis(mapa.blocos[1]).celulas[0].rotulo, "1º");
});

test("displayNumber vence o número do nome", () => {
  const mapa = montarMapa({
    grupos: [grupo("a", { name: "VIP #3", displayNumber: 12 })],
    campanhas: [{ ...vip, groupIds: ["a@g.us"] }, { id: "c-nada", name: "Nada", groupIds: [] }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(mapa.blocos.map((b) => b.titulo), ["VIP Revenda"]);
  assert.equal(vis(mapa.blocos[0]).celulas[0].rotulo, "#12");
});

test("estado, lotação, +n e −n de hoje e a hora de Brasília em que o grupo foi aberto", () => {
  const mapa = montarMapa({
    grupos: [
      grupo("40", { members: 980 }),
      grupo("39", { members: 900 }),
      grupo("2", { members: 10, inviteUrl: undefined }),
    ],
    campanhas: [vip],
    hojePorGrupo: { "39@g.us": { entraram: 38, sairam: 2 } },
    abertosHoje: [{ nome: "VIP 40", seq: 40, grupo: "40@g.us", quando: "2026-10-02T12:14:00.000Z" }],
  });
  const [c2, c39, c40] = vis(mapa.blocos[0]).celulas;
  assert.equal(c40.estado, "cheio");
  assert.equal(c40.novoAs, "09:14");
  assert.equal(c39.estado, "quase");
  assert.equal(c39.lotacao, 0.9);
  assert.equal(c39.entraram, 38);
  assert.equal(c39.sairam, 2);
  assert.equal(c2.estado, "sem_convite");
  assert.equal(c2.entraram, 0);
  assert.deepEqual(mapa.contagens, { todos: 3, cheio: 1, quase: 1, ativo: 0, sem_convite: 1, sumiu: 0 });
});

test("acima de 200 grupos, cada campanha mostra os 60 mais cheios e conta os escondidos", () => {
  const ids = Array.from({ length: 201 }, (_, i) => String(i + 1));
  const mapa = montarMapa({
    grupos: ids.map((id, i) => grupo(id, { members: i })),
    campanhas: [{ ...vip, groupIds: ids.map((id) => `${id}@g.us`) }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [bloco] = mapa.blocos;
  assert.equal(vis(bloco).celulas.length, CELULAS_POR_BLOCO_NO_LIMITE);
  assert.equal(vis(bloco).ocultos, 201 - CELULAS_POR_BLOCO_NO_LIMITE);
  // Os mais cheios ficaram (membros = posição - 1), na ordem do número.
  assert.equal(vis(bloco).celulas[0].rotulo, "#142");
  assert.equal(vis(bloco).celulas.at(-1)?.rotulo, "#201");
  assert.equal(mapa.contagens.todos, 201);
});

test("alertas: campanha toda lotada com o abre-outro desligado e grupo sem convite, no máximo 3", () => {
  const lotada: CampanhaDoMapa = { id: "c-bras", name: "Brás", slug: "bras", groupIds: ["b1@g.us"], autoGrow: false };
  const mapa = montarMapa({
    grupos: [grupo("b1", { members: 1000 }), grupo("s1", { name: "Brás #2", inviteUrl: "" })],
    campanhas: [lotada],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(
    mapa.alertas.map((a) => [a.texto, a.acao.href]),
    [
      ['Brás: todos os grupos lotaram e o "Lotou → abre outro" está desligado', "/painel/campanhas/bras/editar"],
      ["Brás #2 está sem convite", "/painel/grupos"],
    ],
  );

  const muitos = montarMapa({
    grupos: ["s1", "s2", "s3", "s4"].map((id) => grupo(id, { inviteUrl: "" })),
    campanhas: [],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(muitos.alertas.map((a) => a.texto), ["4 grupos estão sem convite"]);
  assert.ok(muitos.alertas.length <= MAX_ALERTAS);

  const ligada = montarMapa({ grupos: [grupo("b1", { members: 1000 })], campanhas: [{ ...lotada, autoGrow: true }], hojePorGrupo: {}, abertosHoje: [] });
  assert.deepEqual(ligada.alertas, []);
});

test("nome acessível diz tudo o que a cor diz", () => {
  const mapa = montarMapa({
    grupos: [grupo("39", { name: "VIP Revenda #39", members: 935, capacity: 1024 })],
    campanhas: [{ ...vip, groupIds: ["39@g.us"] }],
    hojePorGrupo: { "39@g.us": { entraram: 38, sairam: 0 } },
    abertosHoje: [],
  });
  assert.equal(
    rotuloAcessivel("VIP Revenda", vis(mapa.blocos[0]).celulas[0]),
    "VIP Revenda #39, 935 de 1.024, quase lotado, 38 entraram hoje",
  );
  // Nome diferente do rótulo do bloco: entra também.
  const outro = montarMapa({ grupos: [grupo("7", { name: "Brás atacado 7", displayNumber: 7, inviteUrl: "" })], campanhas: [], hojePorGrupo: {}, abertosHoje: [] });
  assert.equal(
    rotuloAcessivel("Outros grupos", vis(outro.blocos[0]).celulas[0]),
    "Outros grupos #7, Brás atacado 7, 100 de 1.000, sem convite",
  );
});

test("lê o número no fim do nome (sem #), ordena numericamente e deixa o sem número por último", () => {
  const mapa = montarMapa({
    grupos: [
      grupo("a", { name: "X 10" }),
      grupo("b", { name: "Clientes antigos" }),
      grupo("c", { name: "X 2" }),
      grupo("d", { name: "X 9" }),
    ],
    campanhas: [],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(vis(mapa.blocos[0]).celulas.map((c) => c.rotulo), ["#2", "#9", "#10", "4º"]);
});

test("displayNumber 0 conta como ausente e cai no número do nome", () => {
  const mapa = montarMapa({
    grupos: [grupo("a", { name: "VIP #5", displayNumber: 0 })],
    campanhas: [],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.equal(vis(mapa.blocos[0]).celulas[0].rotulo, "#5");
});

test("o rotulo acessivel concorda no singular: 1 entrou, 1 saiu", () => {
  const mapa = montarMapa({
    grupos: [grupo("39")],
    campanhas: [vip],
    hojePorGrupo: { "39@g.us": { entraram: 1, sairam: 1 } },
    abertosHoje: [],
  });
  assert.equal(
    rotuloAcessivel("VIP Revenda", vis(mapa.blocos[0]).celulas[0]),
    "VIP Revenda #39, VIP #39, 100 de 1.000, com vaga, 1 entrou hoje, 1 saiu hoje",
  );
});

test("filtro diferente de Todos busca em todos os grupos do bloco, não só nos 60 mais cheios", () => {
  const ids = Array.from({ length: 250 }, (_, i) => String(i + 1));
  // Os 5 sem convite estão vazios, logo fora dos 60 mais cheios.
  const semConvite = new Set(["1", "2", "3", "4", "5"]);
  const mapa = montarMapa({
    grupos: ids.map((id, i) => grupo(id, { members: semConvite.has(id) ? 0 : i + 10, inviteUrl: semConvite.has(id) ? "" : CONVITE })),
    campanhas: [{ ...vip, groupIds: ids.map((id) => `${id}@g.us`) }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [b] = mapa.blocos;
  assert.equal(vis(b).celulas.some((c) => c.estado === "sem_convite"), false);
  assert.equal(mapa.contagens.sem_convite, 5);
  const filtrado = celulasDoFiltro(b, "sem_convite");
  assert.deepEqual(filtrado.celulas.map((c) => c.rotulo), ["#1", "#2", "#3", "#4", "#5"]);
  assert.equal(filtrado.ocultos, 0);
  // "Todos" continua no limite; um filtro com mais de 60 também é cortado, depois de filtrar.
  const ativos = celulasDoFiltro(b, "ativo");
  assert.equal(ativos.celulas.length, CELULAS_POR_BLOCO_NO_LIMITE);
  assert.equal(ativos.ocultos, 245 - CELULAS_POR_BLOCO_NO_LIMITE);
});

test("grupo da campanha que não está no cadastro entra no bloco como 'sumiu', contado e com nome acessível", () => {
  const mapa = montarMapa({
    grupos: [grupo("40")],
    campanhas: [{ ...vip, groupIds: ["40@g.us", "x@g.us", "x@g.us", "y@g.us"] }],
    hojePorGrupo: { "x@g.us": { entraram: 3, sairam: 0 } },
    abertosHoje: [],
  });
  const [b] = mapa.blocos;
  assert.deepEqual(vis(b).celulas.map((c) => [c.rotulo, c.estado]), [["#40", "ativo"], ["sumiu", "sumiu"], ["sumiu", "sumiu"]]);
  assert.equal(mapa.contagens.sumiu, 2);
  assert.equal(mapa.contagens.todos, 3);
  assert.equal(mapa.contagens.ativo, 1);
  assert.deepEqual(celulasDoFiltro(b, "sumiu").celulas.map((c) => c.nome), ["Grupo sem registro", "Grupo sem registro"]);
  assert.equal(rotuloAcessivel("VIP Revenda", vis(b).celulas[1]), "VIP Revenda, Grupo sem registro, sumiu do cadastro, 3 entraram hoje");
});

test("campanha em que todos os grupos sumiram ainda vira bloco; sem nenhum grupo cadastrado não há bloco de sumiu; sumiu não é cortado no limite de 200+", () => {
  const todosSumiram = montarMapa({
    grupos: [grupo("z")],
    campanhas: [{ id: "c-vazia", name: "Vazia", groupIds: ["a@g.us"] }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(todosSumiram.blocos.map((b) => [b.titulo, vis(b).celulas.length]), [["Vazia", 1], ["Outros grupos", 1]]);

  const semCadastro = montarMapa({ grupos: [], campanhas: [{ id: "c-vazia", name: "Vazia", groupIds: ["a@g.us"] }], hojePorGrupo: {}, abertosHoje: [] });
  assert.deepEqual(semCadastro.blocos, []);
  assert.equal(semCadastro.contagens.todos, 0);

  const ids = Array.from({ length: 201 }, (_, i) => String(i + 1));
  const mapa = montarMapa({
    grupos: ids.map((id, i) => grupo(id, { members: i })),
    campanhas: [{ ...vip, groupIds: [...ids.map((id) => `${id}@g.us`), "x@g.us"] }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [b] = mapa.blocos;
  assert.equal(vis(b).celulas.length, CELULAS_POR_BLOCO_NO_LIMITE + 1);
  assert.equal(vis(b).celulas.at(-1)?.estado, "sumiu");
  assert.equal(vis(b).ocultos, 201 - CELULAS_POR_BLOCO_NO_LIMITE);
});

test("resumo do bloco: grupos, % das vagas e entradas de hoje (o sumiu conta como grupo, não como vaga)", () => {
  const mapa = montarMapa({
    grupos: [grupo("40", { members: 900, capacity: 1000 }), grupo("39", { members: 500, capacity: 1000 })],
    campanhas: [{ ...vip, groupIds: ["40@g.us", "39@g.us", "sumido@g.us"] }],
    hojePorGrupo: { "40@g.us": { entraram: 64, sairam: 2 }, "39@g.us": { entraram: 7, sairam: 0 }, "sumido@g.us": { entraram: 1, sairam: 0 } },
    abertosHoje: [],
  });
  assert.deepEqual(resumoDoBloco(mapa.blocos[0]), { grupos: 3, pctDasVagas: 70, entraramHoje: 72 });
});

test("resumo do bloco: a % só olha grupos com capacidade; sem capacidade nenhuma ela é null", () => {
  const misto = montarMapa({
    grupos: [grupo("1", { members: 500, capacity: 1000 }), grupo("2", { members: 300, capacity: 0 })],
    campanhas: [],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  // O grupo sem capacidade conta como grupo, mas as 300 pessoas dele não entram na % (500/1000, não 800/1000).
  assert.deepEqual(resumoDoBloco(misto.blocos[0]), { grupos: 2, pctDasVagas: 50, entraramHoje: 0 });
  const semVaga = montarMapa({ grupos: [grupo("1", { members: 10, capacity: 0 })], campanhas: [], hojePorGrupo: {}, abertosHoje: [] });
  assert.deepEqual(resumoDoBloco(semVaga.blocos[0]), { grupos: 1, pctDasVagas: null, entraramHoje: 0 });
});

test("célula: número sem #, +N em até 3 caracteres e sumiu sem a palavra, em todas as larguras", () => {
  const mapa = montarMapa({
    grupos: [grupo("40"), grupo("solto", { name: "Clientes antigos" })],
    campanhas: [{ ...vip, groupIds: ["40@g.us", "fantasma@g.us"] }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [c40, sumiu] = vis(mapa.blocos[0]).celulas;
  assert.equal(rotuloNaCelula(c40), "40");
  assert.equal(rotuloNaCelula(sumiu), "");
  assert.equal(rotuloNaCelula(vis(mapa.blocos[1]).celulas[0]), "1º");
  assert.deepEqual([0, 7, 99, 100, 999, 1000, 1234, 54000, 250000].map(entradaNaCelula), ["", "+7", "+99", "99+", "99+", "1k", "1k", "54k", "99k"]);
  for (const n of [1, 42, 99, 100, 999, 1000, 99999, 1e7]) assert.ok(entradaNaCelula(n).length <= 3);
});

test("novo do bloco: o aberto hoje mais recente entre as células mostradas", () => {
  const mapa = montarMapa({
    grupos: [grupo("39"), grupo("40"), grupo("2")],
    campanhas: [vip],
    hojePorGrupo: {},
    abertosHoje: [
      { nome: "VIP #39", seq: 39, grupo: "39@g.us", quando: "2026-10-02T12:10:00.000Z" },
      { nome: "VIP #40", seq: 40, grupo: "40@g.us", quando: "2026-10-02T12:14:00.000Z" },
    ],
  });
  const { celulas } = vis(mapa.blocos[0]);
  assert.deepEqual(novoDoBloco(celulas), { hora: "09:14", rotulo: "#40" });
  assert.equal(novoDoBloco(celulas.filter((c) => c.rotulo === "#2")), null);
  assert.equal(novoDoBloco([]), null);
});

test("a campanha maior vem primeiro; empate fica na ordem da lista; Outros grupos sempre por último", () => {
  const mapa = montarMapa({
    grupos: [
      grupo("1"),
      grupo("2"),
      grupo("3"),
      grupo("4"),
      grupo("5"),
      grupo("s1", { name: "Clientes antigos" }),
      grupo("s2", { name: "Fornecedores" }),
    ],
    campanhas: [
      { id: "c-bras", name: "Brás", groupIds: ["1@g.us"] },
      { id: "c-vip", name: "VIP", groupIds: ["2@g.us", "3@g.us", "4@g.us"] },
      { id: "c-sal", name: "Saldão", groupIds: ["5@g.us"] },
    ],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  // "Outros grupos" tem 2 e a Brás 1: mesmo maior, fica no fim (não é campanha).
  assert.deepEqual(mapa.blocos.map((b) => b.titulo), ["VIP", "Brás", "Saldão", "Outros grupos"]);
});

test("lotou enche a célula inteira (Acid sólido, decisão 11); os outros estados enchem até a lotação", () => {
  const mapa = montarMapa({
    grupos: [grupo("40", { members: 980 }), grupo("39", { members: 900 }), grupo("2", { members: 10, inviteUrl: undefined })],
    campanhas: [vip],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [c2, c39, c40] = vis(mapa.blocos[0]).celulas;
  assert.equal(c40.estado, "cheio");
  assert.equal(preenchimentoDaCelula(c40), 1);
  assert.equal(preenchimentoDaCelula(c39), 0.9);
  assert.equal(preenchimentoDaCelula(c2), 0.01);
});

test("largura do bloco: até 6 grupos em 3 colunas, até 12 em 6, acima disso a linha toda", () => {
  assert.deepEqual([1, 6, 7, 12, 13, 40].map((n) => larguraDoBloco(n)), [3, 3, 6, 6, 10, 10]);
});

test("lugares: a maior na linha toda; as menores lado a lado com uma coluna vazia entre elas (o 6 + 3 do mockup)", () => {
  assert.deepEqual(lugaresDosBlocos([40, 12, 6]), [
    { linha: 1, coluna: 1, largura: 10 },
    { linha: 2, coluna: 1, largura: 6 },
    { linha: 2, coluna: 8, largura: 3 },
  ]);
  // Dois de 6 não cabem lado a lado (6 + 1 + 6 > 10); três de 3 também não (3 + 1 + 3 + 1 + 3 > 10).
  assert.deepEqual(lugaresDosBlocos([12, 7, 3, 2, 1]), [
    { linha: 1, coluna: 1, largura: 6 },
    { linha: 2, coluna: 1, largura: 6 },
    { linha: 2, coluna: 8, largura: 3 },
    { linha: 3, coluna: 1, largura: 3 },
    { linha: 3, coluna: 5, largura: 3 },
  ]);
  // A linha toda depois de um bloco pequeno desce para a próxima linha.
  assert.deepEqual(lugaresDosBlocos([3, 20]), [
    { linha: 1, coluna: 1, largura: 3 },
    { linha: 2, coluna: 1, largura: 10 },
  ]);
  assert.deepEqual(lugaresDosBlocos([]), []);
});

test("lugares: em qualquer ordem, nenhum bloco passa da coluna 10 nem pisa no vizinho da mesma linha", () => {
  const base = [2, 5, 7, 13, 1, 9];
  for (const tamanhos of [base, [...base].reverse(), [13, 1, 9, 2, 5, 7], [9, 7, 5, 2, 1, 13]]) {
    const lugares = lugaresDosBlocos(tamanhos);
    assert.equal(lugares.length, tamanhos.length);
    for (const l of lugares) assert.ok(l.coluna >= 1 && l.coluna + l.largura - 1 <= 10, JSON.stringify(l));
    for (const a of lugares) {
      for (const b of lugares) {
        if (a === b || a.linha !== b.linha) continue;
        const separados = a.coluna + a.largura <= b.coluna || b.coluna + b.largura <= a.coluna;
        assert.ok(separados, `${JSON.stringify(a)} × ${JSON.stringify(b)}`);
      }
    }
  }
});
