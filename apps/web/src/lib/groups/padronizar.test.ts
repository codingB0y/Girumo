import assert from "node:assert/strict";
import test from "node:test";

import type { EstadoGrupo } from "./estado";
import {
  MAX_BASE,
  NOTA_DA_DECISAO,
  baseInicial,
  completarOrdem,
  conflitosDaCampanha,
  mover,
  nomeNaPosicao,
  ordemInicial,
  ordemPadrao,
  padronizarGrowTemplate,
  planejarRenomes,
  resumoDoPadrao,
  validarBase,
  type Conflito,
} from "./padronizar";

function grupo(over: Partial<EstadoGrupo> & Pick<EstadoGrupo, "whatsappGroupId">): EstadoGrupo {
  return {
    posicao: 1,
    groupId: `id-${over.whatsappGroupId}`,
    nome: "Grupo",
    membros: 10,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/AAA",
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado: "fila",
    podeReabrir: false,
    naRegra: { menos_enchendo: true, lotados: false, com_gente: true },
    ...over,
  };
}

/* ---------- ordemPadrao ---------- */

test("ordemPadrao: lotados do mais cheio ao menos cheio, enchendo, fila do mais cheio, vazios na posição atual", () => {
  const estados = [
    grupo({ whatsappGroupId: "vazio-b", posicao: 1, estado: "vazio", membros: 1 }),
    grupo({ whatsappGroupId: "fila-pequena", posicao: 2, estado: "fila", membros: 9 }),
    grupo({ whatsappGroupId: "lotado-812", posicao: 3, estado: "lotado", membros: 812 }),
    grupo({ whatsappGroupId: "enchendo", posicao: 4, estado: "enchendo", membros: 958 }),
    grupo({ whatsappGroupId: "lotado-1003", posicao: 5, estado: "lotado", membros: 1003 }),
    grupo({ whatsappGroupId: "fila-grande", posicao: 6, estado: "fila", membros: 412 }),
    grupo({ whatsappGroupId: "vazio-a", posicao: 7, estado: "vazio", membros: 2 }),
  ];

  // vazio-b antes de vazio-a mesmo tendo menos membros: o spec manda os vazios
  // pela posição (o mockup ordenava por membros; o spec vence).
  assert.deepEqual(ordemPadrao(estados), [
    "lotado-1003",
    "lotado-812",
    "enchendo",
    "fila-grande",
    "fila-pequena",
    "vazio-b",
    "vazio-a",
  ]);
});

test("ordemPadrao: empate de membros fica na posição atual e a lista de entrada não muda", () => {
  const estados = [
    grupo({ whatsappGroupId: "b", posicao: 2, estado: "lotado", membros: 1000 }),
    grupo({ whatsappGroupId: "a", posicao: 1, estado: "lotado", membros: 1000 }),
  ];
  const copia = estados.map((g) => g.whatsappGroupId);

  assert.deepEqual(ordemPadrao(estados), ["a", "b"]);
  assert.deepEqual(
    estados.map((g) => g.whatsappGroupId),
    copia,
  );
});

test("ordemInicial: campanha já padronizada volta na ordem salva; nunca padronizada, na sugestão", () => {
  const estados = [
    grupo({ whatsappGroupId: "fila", posicao: 1, estado: "fila", membros: 5 }),
    grupo({ whatsappGroupId: "lotado", posicao: 2, estado: "lotado", membros: 1000 }),
  ];

  assert.deepEqual(ordemInicial(estados, { subjectPattern: "Kids {n}", padronizadoEm: "2026-10-10T12:00:00.000Z" }), [
    "fila",
    "lotado",
  ]);
  assert.deepEqual(ordemInicial(estados, { subjectPattern: "Kids {n}" }), ["lotado", "fila"]);
  assert.deepEqual(ordemInicial(estados, null), ["lotado", "fila"]);
});

/* ---------- validarBase ---------- */

test("validarBase tira o espaço das pontas", () => {
  assert.deepEqual(validarBase("  Moda Kids do Sul  "), { ok: true, base: "Moda Kids do Sul" });
});

test("validarBase recusa vazio, só espaço e o que não é texto", () => {
  for (const ruim of ["", "   ", undefined, null, 42]) {
    const r = validarBase(ruim);
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(ruim)}`);
    if (!r.ok) assert.equal(r.error, "Escreva o nome base.");
  }
});

test("validarBase recusa quebra de linha e caractere de controle colados do celular", () => {
  for (const ruim of ["Moda\nKids", "Moda\r\nKids", "Moda\tKids", "Moda Kids"]) {
    const r = validarBase(ruim);
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(ruim)}`);
    if (!r.ok) assert.match(r.error, /quebra de linha/);
  }
});

test("validarBase recusa {n} — o número entra sozinho e o auto-grow trocaria só o primeiro", () => {
  const r = validarBase("Promo {n}");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /\{n\}/);
});

test("validarBase aceita até 90 unidades e recusa 91", () => {
  assert.equal(validarBase("a".repeat(MAX_BASE)).ok, true);
  const r = validarBase("a".repeat(MAX_BASE + 1));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /90/);
});

test("validarBase conta emoji como 2: 45 emoji passam, 46 não", () => {
  // Conservador de propósito: seja qual for a conta do WhatsApp, "<base> 999"
  // nunca passa de 100 e o número nunca é cortado.
  assert.equal(validarBase("🔥".repeat(45)).ok, true);
  assert.equal(validarBase("🔥".repeat(46)).ok, false);
});

/* ---------- planejarRenomes ---------- */

const BASE = "Moda Kids do Sul";

test("planejarRenomes: só quem muda de nome vira job, com o número da posição", () => {
  const estados = [
    grupo({ whatsappGroupId: "g1", groupId: "grp-1", nome: "MODA KIDS SUL 1" }),
    grupo({ whatsappGroupId: "g2", groupId: "grp-2", nome: "Moda Kids do Sul 2" }),
    grupo({ whatsappGroupId: "g3", groupId: "grp-3", nome: "Grupo 19" }),
  ];

  assert.deepEqual(planejarRenomes({ ordem: ["g1", "g2", "g3"], base: BASE, estados, conflitos: new Set() }), [
    { groupId: "grp-1", whatsappGroupId: "g1", subject: "Moda Kids do Sul 1" },
    { groupId: "grp-3", whatsappGroupId: "g3", subject: "Moda Kids do Sul 3" },
  ]);
});

test("planejarRenomes: grupo em duas campanhas e grupo sem admin ficam de fora, sem tirar o número dos outros", () => {
  const estados = [
    grupo({ whatsappGroupId: "conflito", nome: "Grupo VIP Kids" }),
    grupo({ whatsappGroupId: "sem-admin", nome: "Antigo", isAdmin: false }),
    grupo({ whatsappGroupId: "g3", groupId: "grp-3", nome: "Novo grupo" }),
  ];

  assert.deepEqual(
    planejarRenomes({
      ordem: ["conflito", "sem-admin", "g3"],
      base: BASE,
      estados,
      conflitos: new Set(["conflito"]),
    }),
    [{ groupId: "grp-3", whatsappGroupId: "g3", subject: "Moda Kids do Sul 3" }],
  );
});

test("planejarRenomes: grupo renomeado à mão no WhatsApp depois do Padronizar volta para o nome da sequência", () => {
  // O nome comparado é o do WhatsApp (groups.name, atualizado pelo sync); o
  // apelido interno do painel não entra na conta.
  const estados = [grupo({ whatsappGroupId: "g1", groupId: "grp-1", nome: "Kids Promo Sábado" })];

  assert.deepEqual(planejarRenomes({ ordem: ["g1"], base: BASE, estados, conflitos: new Set() }), [
    { groupId: "grp-1", whatsappGroupId: "g1", subject: "Moda Kids do Sul 1" },
  ]);
});

test("planejarRenomes: JID sem estado (órfão no pool) não vira job mas ocupa a posição", () => {
  const estados = [grupo({ whatsappGroupId: "g2", groupId: "grp-2", nome: "x" })];

  assert.deepEqual(planejarRenomes({ ordem: ["orfao", "g2"], base: BASE, estados, conflitos: new Set() }), [
    { groupId: "grp-2", whatsappGroupId: "g2", subject: "Moda Kids do Sul 2" },
  ]);
});

/* ---------- completarOrdem ---------- */

test("completarOrdem põe os órfãos no fim, na ordem do pool, sem repetir", () => {
  const r = completarOrdem(["g2", "g1"], ["g1", "orfao-a", "g2", "orfao-b", "g1"]);
  assert.deepEqual(r, { ok: true, ordem: ["g2", "g1", "orfao-a", "orfao-b"] });
});

test("completarOrdem recusa JID de fora da campanha e JID repetido", () => {
  assert.equal(completarOrdem(["g1", "outro"], ["g1", "g2"]).ok, false);
  assert.equal(completarOrdem(["g1", "g1"], ["g1", "g2"]).ok, false);
});

test("completarOrdem recusa campanha sem grupo", () => {
  const r = completarOrdem([], []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /não tem grupos/);
});

/* ---------- grow_template ---------- */

test("padronizarGrowTemplate troca o molde, grava a data e preserva o resto", () => {
  // Sem subjectPattern o parseGrowTemplate desliga o auto-grow; sem desc/mediaId
  // o próximo grupo nasce sem a identidade aplicada.
  assert.deepEqual(
    padronizarGrowTemplate(
      { subjectPattern: "Ofertas {n}", desc: "Bazar", mediaId: "m1", announce: false },
      "Moda Kids do Sul",
      "2026-10-10T12:00:00.000Z",
    ),
    {
      subjectPattern: "Moda Kids do Sul {n}",
      desc: "Bazar",
      mediaId: "m1",
      announce: false,
      padronizadoEm: "2026-10-10T12:00:00.000Z",
    },
  );
  assert.deepEqual(padronizarGrowTemplate(null, "Kids", "2026-10-10T12:00:00.000Z"), {
    subjectPattern: "Kids {n}",
    padronizadoEm: "2026-10-10T12:00:00.000Z",
  });
});

test("baseInicial reaproveita a base do molde e cai no nome da campanha", () => {
  assert.equal(baseInicial("Moda Kids do Sul", { subjectPattern: "Kids Sul {n}" }), "Kids Sul");
  assert.equal(baseInicial("Moda Kids do Sul", { subjectPattern: "Promo #{n}" }), "Moda Kids do Sul");
  assert.equal(baseInicial("  Moda Kids do Sul ", null), "Moda Kids do Sul");
});

/* ---------- tela ---------- */

test("conflitosDaCampanha lista só os grupos desta campanha e o nome das outras", () => {
  const conflitos: Conflito[] = [
    {
      whatsappGroupId: "vip",
      nome: "Grupo VIP Kids",
      campanhas: [
        { id: "esta", name: "Moda Kids do Sul", slug: "moda-kids", posicao: 5 },
        { id: "outra", name: "Saldão Outubro", slug: "saldao", posicao: 1 },
      ],
    },
    {
      whatsappGroupId: "alheio",
      nome: "Grupo de outra dupla",
      campanhas: [
        { id: "x", name: "X", slug: "x", posicao: 1 },
        { id: "y", name: "Y", slug: "y", posicao: 1 },
      ],
    },
  ];

  const r = conflitosDaCampanha(conflitos, "esta");

  assert.deepEqual([...r.jids], ["vip"]);
  assert.deepEqual(r.nomes, ["Grupo VIP Kids"]);
  assert.deepEqual(r.outras, ["Saldão Outubro"]);
});

test("mover troca com o vizinho, não mexe na entrada e não sai das pontas", () => {
  const ordem = ["a", "b", "c"];

  assert.deepEqual(mover(ordem, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(mover(ordem, 2, -1), ["a", "c", "b"]);
  assert.deepEqual(mover(ordem, 0, -1), ["a", "b", "c"]);
  assert.deepEqual(mover(ordem, 2, 1), ["a", "b", "c"]);
  assert.deepEqual(ordem, ["a", "b", "c"]);
});

test("resumoDoPadrao conta igual à rota e diz o nome do próximo grupo", () => {
  const estados = [
    grupo({ whatsappGroupId: "g1", nome: "Moda Kids do Sul 1", membros: 1000, estado: "lotado" }),
    grupo({ whatsappGroupId: "g2", nome: "Kids Sul #3", estado: "lotado" }),
    grupo({ whatsappGroupId: "vip", nome: "Grupo VIP Kids", estado: "lotado" }),
    grupo({ whatsappGroupId: "sem-admin", nome: "Antigo", isAdmin: false, estado: "fila" }),
  ];
  const ordem = ["g1", "g2", "vip", "sem-admin"];
  const conflitos = new Set(["vip"]);

  const r = resumoDoPadrao({ ordem, base: BASE, estados, conflitos, tamanhoDoPool: 5 });

  assert.equal(r.mudam, planejarRenomes({ ordem, base: BASE, estados, conflitos }).length);
  assert.equal(r.mudam, 1);
  assert.equal(r.jaCertos, 1);
  // Pool com 5 (um órfão sem linha em groups): o auto-grow numera pelo pool.
  assert.equal(r.proximo, "Moda Kids do Sul 6");
  assert.deepEqual(
    r.linhas.map((l) => [l.numero, l.novo, l.decisao]),
    [
      [1, "Moda Kids do Sul 1", "certo"],
      [2, "Moda Kids do Sul 2", "muda"],
      [3, "Grupo VIP Kids", "conflito"],
      [4, "Antigo", "sem_admin"],
    ],
  );
  assert.equal(NOTA_DA_DECISAO.conflito, "fica igual · em 2 campanhas");
});

test("nomeNaPosicao numera a partir de 1", () => {
  assert.equal(nomeNaPosicao("Kids", 0), "Kids 1");
});
