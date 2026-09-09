import assert from "node:assert/strict";
import { test } from "node:test";

import type { Group } from "@/lib/mock-data";
import {
  conferidoHa,
  contagensDosFiltros,
  estadoDoGrupo,
  lotacao,
  maisCheioPrimeiro,
  numero,
  prestesALotar,
  romaneio,
} from "./grupos";

function grupo(over: Partial<Group> & { name: string; members: number }): Group {
  return {
    id: over.name,
    whatsappGroupId: `${over.name}@g.us`,
    capacity: 1024,
    selected: false,
    engagement: "medio",
    inviteUrl: "https://chat.whatsapp.com/abc",
    ...over,
  } as Group;
}

test("lotação é fração entre 0 e 1", () => {
  assert.equal(lotacao(512, 1024), 0.5);
  assert.equal(lotacao(0, 1024), 0);
  assert.equal(lotacao(1024, 1024), 1);
});

test("capacidade zero ou ausente não vira Infinity nem NaN na barra", () => {
  assert.equal(lotacao(10, 0), 0);
  assert.equal(lotacao(10, Number.NaN), 0);
  assert.equal(lotacao(Number.NaN, 1024), 0);
});

test("membros acima da capacidade não passam de 100%", () => {
  assert.equal(lotacao(1200, 1024), 1, "barra cheia é o teto, não estoura o desenho");
});

test("estado do grupo separa cheio, quase, ativo e sem convite", () => {
  assert.equal(estadoDoGrupo(grupo({ name: "cheio", members: 1012 })), "cheio", "1012/1024 = 98,8%");
  assert.equal(estadoDoGrupo(grupo({ name: "quase", members: 900 })), "quase", "900/1024 = 87,9%");
  assert.equal(estadoDoGrupo(grupo({ name: "ativo", members: 578 })), "ativo");
  assert.equal(estadoDoGrupo(grupo({ name: "sem", members: 10, inviteUrl: undefined })), "sem_convite");
});

test("sem convite ganha do resto: lotado sem link continua sendo problema de link", () => {
  assert.equal(estadoDoGrupo(grupo({ name: "x", members: 1024, inviteUrl: undefined })), "sem_convite");
});

test("romaneio soma pessoas e vagas dos grupos", () => {
  const total = romaneio([
    grupo({ name: "a", members: 578 }),
    grupo({ name: "b", members: 500 }),
    grupo({ name: "c", members: 1012 }),
  ]);
  assert.equal(total.grupos, 3);
  assert.equal(total.pessoas, 2090);
  assert.equal(total.vagas, 1024 * 3 - 2090);
  assert.equal(total.lotados, 1);
  assert.equal(total.ativos, 2);
});

test("quem está quase lotando conta como ativo, não como categoria à parte", () => {
  const total = romaneio([grupo({ name: "quase", members: 900 }), grupo({ name: "ok", members: 100 })]);
  assert.equal(total.ativos, 2);
  assert.equal(total.lotados, 0);
});

test("lista vazia devolve zeros em vez de quebrar", () => {
  assert.deepEqual(romaneio([]), { grupos: 0, pessoas: 0, vagas: 0, lotados: 0, semConvite: 0, ativos: 0 });
});

test("prestes a lotar é o mais cheio que ainda não lotou, com quantas vagas faltam", () => {
  const achado = prestesALotar([
    grupo({ name: "cheio", members: 1020 }),
    grupo({ name: "quase-1", members: 890 }),
    grupo({ name: "quase-2", members: 950 }),
    grupo({ name: "tranquilo", members: 100 }),
  ]);
  assert.equal(achado?.grupo.name, "quase-2");
  assert.equal(achado?.faltam, 74);
});

test("sem ninguém perto de lotar não inventa aviso", () => {
  assert.equal(prestesALotar([grupo({ name: "a", members: 100 })]), null);
});

test("ordena do mais cheio para o mais vazio", () => {
  const ordem = maisCheioPrimeiro([
    grupo({ name: "meio", members: 500 }),
    grupo({ name: "cheio", members: 1012 }),
    grupo({ name: "vazio", members: 10 }),
  ]).map((g) => g.name);
  assert.deepEqual(ordem, ["cheio", "meio", "vazio"]);
});

test("empate desempata pelo nome: a ordem não pode dançar entre renders", () => {
  const ordem = maisCheioPrimeiro([
    grupo({ name: "Zeta", members: 500 }),
    grupo({ name: "Alfa", members: 500 }),
  ]).map((g) => g.name);
  assert.deepEqual(ordem, ["Alfa", "Zeta"]);
});

test("ordenar não mexe na lista recebida", () => {
  const original = [grupo({ name: "b", members: 10 }), grupo({ name: "a", members: 900 })];
  maisCheioPrimeiro(original);
  assert.equal(original[0].name, "b", "a lista de fora continua na ordem que veio");
});

const agora = new Date(2026, 8, 7, 15, 0);

test("conferido há pouco é agora; depois vira minutos, horas e dias", () => {
  assert.equal(conferidoHa(new Date(2026, 8, 7, 14, 59).toISOString(), agora), "agora");
  assert.equal(conferidoHa(new Date(2026, 8, 7, 14, 30).toISOString(), agora), "há 30 min");
  assert.equal(conferidoHa(new Date(2026, 8, 7, 13, 0).toISOString(), agora), "há 2 h");
  assert.equal(conferidoHa(new Date(2026, 8, 6, 13, 0).toISOString(), agora), "ontem");
  assert.equal(conferidoHa(new Date(2026, 8, 4, 13, 0).toISOString(), agora), "há 3 dias");
});

test("sem carimbo devolve vazio: quem chama escreve o texto de nunca conferido", () => {
  assert.equal(conferidoHa(null, agora), "");
  assert.equal(conferidoHa(undefined, agora), "");
  assert.equal(conferidoHa("data torta", agora), "");
});

test("carimbo no futuro não vira contagem negativa", () => {
  assert.equal(conferidoHa(new Date(2026, 8, 7, 16, 0).toISOString(), agora), "agora");
});

test("contagens do segmentado batem com o romaneio", () => {
  const grupos = [
    grupo({ name: "cheio", members: 1012 }),
    grupo({ name: "ativo", members: 100 }),
    grupo({ name: "sem", members: 5, inviteUrl: undefined }),
  ];
  assert.deepEqual(contagensDosFiltros(romaneio(grupos)), { todos: 3, ativos: 1, cheios: 1, semConvite: 1 });
});

test("grupo com mais membros que a capacidade não gera vaga negativa no romaneio", () => {
  const total = romaneio([grupo({ name: "estourado", members: 1200, capacity: 1024 })]);
  assert.equal(total.vagas, 0, "vaga negativa viraria subtração no total do romaneio");
  assert.equal(total.pessoas, 1200);
  assert.equal(total.lotados, 1);
});

test("número para a tela: dado torto vira zero em vez de derrubar o render", () => {
  assert.equal(numero(1024), "1.024");
  assert.equal(numero(0), "0");
  assert.equal(numero(null), "0");
  assert.equal(numero(undefined), "0");
  assert.equal(numero(Number.NaN), "0");
});
