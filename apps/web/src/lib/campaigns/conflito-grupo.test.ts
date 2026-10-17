import assert from "node:assert/strict";
import test from "node:test";

import {
  avisoDaCampanha,
  faltaEscolher,
  GRUPO_SAIU_DA_CAMPANHA,
  gruposDoEspelho,
  lerConflitoGrupo,
  lerCorpo409,
  lerEscolha,
  mensagemConflito,
  planejarEscolha,
  travasDoSeletor,
  type ConflitoDeGrupo,
} from "./conflito-grupo";

const A1 = "6a7e0000-0000-4000-8000-0000000000a1";
const A2 = "6a7e0000-0000-4000-8000-0000000000a2";
const A3 = "6a7e0000-0000-4000-8000-0000000000a3";
const A4 = "6a7e0000-0000-4000-8000-0000000000a4";
const FORA = "6a7e0000-0000-4000-8000-0000000000ff";

test("lê a mensagem do trigger: o grupo e a campanha que já o tem", () => {
  assert.deepEqual(lerConflitoGrupo(`grupo_em_outra_campanha:120363001@g.us:${A1}`), {
    jid: "120363001@g.us",
    campanhaId: A1,
  });
});

test("o JID vai até o último ':' antes do uuid, e o uuid volta minúsculo", () => {
  assert.deepEqual(lerConflitoGrupo(`grupo_em_outra_campanha:abc:def@g.us:${A1.toUpperCase()}`), {
    jid: "abc:def@g.us",
    campanhaId: A1,
  });
});

test("acha a mensagem mesmo embrulhada por quem repassou o erro", () => {
  assert.deepEqual(lerConflitoGrupo(`Error: grupo_em_outra_campanha:g1@g.us:${A2}`), {
    jid: "g1@g.us",
    campanhaId: A2,
  });
});

test("qualquer outro erro não é conflito de grupo", () => {
  assert.equal(
    lerConflitoGrupo('duplicate key value violates unique constraint "campaign_groups_tenant_slug_unique"'),
    null,
  );
  assert.equal(lerConflitoGrupo("grupo_em_outra_campanha:g1@g.us:nao-e-uuid"), null);
  assert.equal(lerConflitoGrupo(""), null);
});

test("o corpo do 409 só vale com grupo e campanha completos", () => {
  assert.deepEqual(lerCorpo409({ error: "x", grupo: "g1@g.us", campanha: { id: A1, name: "Saldão" } }), {
    grupo: "g1@g.us",
    campanha: { id: A1, name: "Saldão" },
  });
  // O 402 do gate de plano também é erro com corpo — não pode virar conflito.
  assert.equal(lerCorpo409({ error: "Limite do plano", upgradeUrl: "/painel/configuracoes" }), null);
  assert.equal(lerCorpo409({ grupo: "g1@g.us", campanha: { id: A1 } }), null);
  assert.equal(lerCorpo409(null), null);
});

test("a mensagem nomeia a outra campanha, e o grupo quando a tela sabe o nome", () => {
  assert.equal(
    mensagemConflito(null, "Saldão Outubro"),
    "Um dos grupos já está na campanha “Saldão Outubro”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
  );
  assert.equal(
    mensagemConflito("Saldão 1", "Saldão Outubro"),
    "O grupo “Saldão 1” já está na campanha “Saldão Outubro”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
  );
});

const campanhas = [
  { id: A1, name: "Moda Kids do Sul", groupIds: ["g1", "g2", "g9"] },
  { id: A2, name: "Saldão Outubro", groupIds: ["g3", "g9"] },
];

test("na edição, grupo de outra campanha trava com o nome dela; os da própria não", () => {
  const travas = travasDoSeletor(campanhas, { id: A1, groupIds: ["g1", "g2", "g9"] });
  assert.deepEqual([...travas], [["g3", "Saldão Outubro"]]);
});

test("conflito antigo (grupo nesta e noutra) não trava: o lojista tem de conseguir desmarcar", () => {
  const travas = travasDoSeletor(campanhas, { id: A2, groupIds: ["g3", "g9"] });
  assert.equal(travas.has("g9"), false);
  assert.equal(travas.get("g1"), "Moda Kids do Sul");
});

test("na criação toda campanha é outra; o grupo em duas fica com o nome da primeira da lista", () => {
  const travas = travasDoSeletor(campanhas, { id: null, groupIds: [] });
  assert.deepEqual([...travas.keys()].sort(), ["g1", "g2", "g3", "g9"]);
  assert.equal(travas.get("g9"), "Moda Kids do Sul");
});

test("espelho de comunidade nativa: grupo que já está numa campanha fica fora da gaveta nova", () => {
  // Gaveta ainda não existe (insert): sem o filtro o trigger recusaria a gaveta inteira.
  assert.deepEqual(gruposDoEspelho(["g1", "g5", "g6"], campanhas, null), ["g5", "g6"]);
});

test("espelho: o que a gaveta já tinha continua, mesmo em conflito antigo — nada sai sozinho", () => {
  const comGaveta = [...campanhas, { id: A3, name: "Comunidade", groupIds: ["g9", "g5"] }];
  // g9 já era da gaveta (conflito antigo com A1 e A2): fica. g3 é novo e é de A2: sai. g7 é livre: entra.
  assert.deepEqual(gruposDoEspelho(["g9", "g3", "g5", "g7"], comGaveta, A3), ["g9", "g5", "g7"]);
});

test("a escolha precisa de grupo e de uuid de campanha", () => {
  assert.deepEqual(lerEscolha({ jid: " g1@g.us ", ficaEm: A1.toUpperCase() }), { ok: true, jid: "g1@g.us", ficaEm: A1 });
  assert.deepEqual(lerEscolha({ ficaEm: A1 }), { ok: false, error: "Grupo inválido." });
  assert.deepEqual(lerEscolha({ jid: "g1@g.us", ficaEm: "moda-kids" }), { ok: false, error: "Campanha inválida." });
  assert.deepEqual(lerEscolha({ jid: "x".repeat(201), ficaEm: A1 }), { ok: false, error: "Grupo inválido." });
  assert.deepEqual(lerEscolha("g1@g.us"), { ok: false, error: "Grupo inválido." });
});

const linhas = [
  { id: A1, group_ids: ["g1", "g9"] },
  { id: A2, group_ids: ["g9", "g9", "g3"] },
  { id: A3, group_ids: ["g9"] },
];

test("o grupo fica numa campanha e sai de todas as outras que o têm", () => {
  assert.deepEqual(planejarEscolha(linhas, { jid: "g9", ficaEm: A2 }), { ok: true, tirarDe: [A1, A3] });
  assert.deepEqual(planejarEscolha(linhas, { jid: "g1", ficaEm: A1 }), { ok: true, tirarDe: [] });
});

test("se a campanha escolhida não tem mais o grupo, nada sai (senão ele ficaria sem campanha)", () => {
  assert.deepEqual(planejarEscolha(linhas, { jid: "g3", ficaEm: A1 }), {
    ok: false,
    status: 409,
    error: GRUPO_SAIU_DA_CAMPANHA,
  });
});

test("campanha escolhida que não é da loja é 404", () => {
  assert.deepEqual(planejarEscolha(linhas, { jid: "g9", ficaEm: FORA }), {
    ok: false,
    status: 404,
    error: "Campanha não encontrada.",
  });
});

const moda = { id: A1, name: "Moda Kids do Sul", slug: "moda", posicao: 5 };
const saldao = { id: A2, name: "Saldão Outubro", slug: "saldao", posicao: 2 };
const bota = { id: A3, name: "Bota Fora", slug: "bota", posicao: 3 };
const conflitos: ConflitoDeGrupo[] = [
  { whatsappGroupId: "g9", nome: "Grupo VIP", campanhas: [moda, saldao] },
  { whatsappGroupId: "g8", nome: "Novo grupo", campanhas: [moda, saldao] },
  { whatsappGroupId: "g7", nome: "Outro", campanhas: [saldao, bota] },
];

test("falta escolher conta grupo sem escolha e escolha que não é uma das campanhas dele", () => {
  assert.equal(faltaEscolher(conflitos, {}), 3);
  assert.equal(faltaEscolher(conflitos, { g9: A2, g8: A3, g7: A3 }), 1);
  assert.equal(faltaEscolher(conflitos, { g9: A2, g8: A1, g7: A3 }), 0);
});

test("a faixa conta só os grupos desta campanha e nomeia as outras", () => {
  assert.deepEqual(avisoDaCampanha(conflitos, A1), {
    inicio: "2 grupos desta campanha também estão em",
    nomes: "Saldão Outubro",
  });
  assert.deepEqual(avisoDaCampanha(conflitos, A3), {
    inicio: "1 grupo desta campanha também está em",
    nomes: "Saldão Outubro",
  });
  assert.deepEqual(avisoDaCampanha(conflitos, A2), {
    inicio: "3 grupos desta campanha também estão em",
    nomes: "Moda Kids do Sul e Bota Fora",
  });
  const quatro: ConflitoDeGrupo[] = [
    {
      whatsappGroupId: "g1",
      nome: "G",
      campanhas: [moda, saldao, bota, { id: A4, name: "Queima", slug: "queima", posicao: 1 }],
    },
  ];
  assert.deepEqual(avisoDaCampanha(quatro, A1), {
    inicio: "1 grupo desta campanha também está em",
    nomes: "Saldão Outubro, Bota Fora e Queima",
  });
  assert.equal(avisoDaCampanha(conflitos, FORA), null);
});
