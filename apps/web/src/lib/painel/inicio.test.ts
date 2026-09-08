import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAMPANHAS_NA_INICIO,
  cabecalhoDoDia,
  campanhasDaInicio,
  diaHoraCurto,
  diasRestantesNoMes,
  iniciais,
  linhaDoDia,
  marcasDaFita,
  resumoDoEstoque,
  rotulosDaFita,
  vagasDaCampanha,
} from "./inicio";
import { chipDaCampanha, linhaDeVagas } from "./campanhas";

const sexta = new Date(2026, 8, 4, 15, 0); // sexta, 04/09/2026

test("cabeçalho do dia nas duas larguras", () => {
  assert.deepEqual(cabecalhoDoDia(sexta), { titulo: "Sexta, 04 de setembro", tituloCurto: "Sex, 04 de setembro" });
});

test("linha do dia conta entradas e o último post; sem post, diz que não houve", () => {
  const post = new Date(2026, 8, 2, 12, 12).toISOString();
  assert.equal(linhaDoDia({ hoje: 0, semana: 4, ultimoPost: post }, sexta), "0 entradas hoje · 4 na semana · último post qua 12:12");
  assert.equal(linhaDoDia({ hoje: 1, semana: 1, ultimoPost: null }, sexta), "1 entrada hoje · 1 na semana · nenhum post ainda");
});

test("dia e hora curtos: dia da semana na semana corrente, data depois", () => {
  assert.equal(diaHoraCurto(new Date(2026, 8, 2, 14, 20).toISOString(), sexta), "qua 14:20");
  assert.equal(diaHoraCurto(new Date(2026, 7, 20, 9, 0).toISOString(), sexta), "20/08");
  assert.equal(diaHoraCurto("não é data", sexta), "");
});

test("dias restantes no mês: 04/09 → 26; último dia → 0", () => {
  assert.equal(diasRestantesNoMes(sexta), 26);
  assert.equal(diasRestantesNoMes(new Date(2026, 8, 30)), 0);
});

test("rótulos da fita a cada quinto da meta", () => {
  assert.deepEqual(
    rotulosDaFita(50_000).map((r) => r.texto),
    ["R$ 10 mil", "20", "30", "40", "50 mil"],
  );
  assert.deepEqual(rotulosDaFita(12_500).map((r) => r.texto), ["R$ 2,5 mil", "5", "7,5", "10", "12,5 mil"]);
  assert.deepEqual(rotulosDaFita(50_000).map((r) => r.posicao), [20, 40, 60, 80, 100]);
});

test("marcas da fita: uma a cada passo, nunca zero", () => {
  assert.equal(marcasDaFita(50_000, 5_000), 10);
  assert.equal(marcasDaFita(3_000, 5_000), 1);
  assert.equal(marcasDaFita(0, 5_000), 1);
});

test("iniciais: duas letras, sem nome vira ponto", () => {
  assert.equal(iniciais("Josiane Moura"), "JM");
  assert.equal(iniciais("ana"), "A");
  assert.equal(iniciais(""), "•");
});

const grupos = [
  { id: "u1", whatsappGroupId: "w1@g.us", name: "A", members: 500, capacity: 1024 },
  { id: "u2", whatsappGroupId: "w2@g.us", name: "B", members: 1012, capacity: 1024 },
  { id: "u3", whatsappGroupId: "w3@g.us", name: "C", members: 0, capacity: 1024 },
];

test("vagas da campanha casam por whatsapp id ou por uuid", () => {
  assert.deepEqual(vagasDaCampanha(["w1@g.us", "u3"], grupos), { pessoas: 500, capacidade: 2048, lotacao: 500 / 2048 });
  assert.deepEqual(vagasDaCampanha([], grupos), { pessoas: 0, capacidade: 0, lotacao: 0 });
});

test("resumo do estoque soma pessoas e vagas e acha o grupo quase cheio", () => {
  const r = resumoDoEstoque(grupos);
  assert.equal(r.grupos, 3);
  assert.equal(r.pessoas, 1512);
  assert.equal(r.vagas, 3072 - 1512);
  assert.equal(r.quaseCheio?.name, "B");
  assert.equal(resumoDoEstoque([grupos[0]]).quaseCheio, null);
});

const gruposDoPainel = [
  { id: "g1", whatsappGroupId: "w1@g.us", name: "Com vaga", members: 100, capacity: 200, selected: false, engagement: "medio" as const, inviteUrl: "https://chat.whatsapp.com/one" },
  { id: "g2", whatsappGroupId: "w2@g.us", name: "Cheio", members: 195, capacity: 200, selected: false, engagement: "medio" as const, inviteUrl: "https://chat.whatsapp.com/two" },
];

test("campanha cujos grupos sumiram não diz 'Pronta' nem inventa '0 / 0 vagas'", () => {
  // O defeito inteiro em um caso: `group_ids` aponta para grupos que não
  // resolvem mais em /api/groups (apagados no WhatsApp, ou gravados com o uuid
  // da linha em vez do JID). A regra antiga do widget era
  // `capacidade > 0 && pessoas >= capacidade`: a guarda de capacidade dava
  // `false`, o chip caía em "Pronta" e a linha imprimia "0 / 0 vagas".
  const [etiqueta] = campanhasDaInicio(
    [{ id: "c1", name: "Reativação", groupIds: ["sumiu1", "sumiu2"], slug: "reativacao" }],
    gruposDoPainel,
    [],
  );

  assert.equal(etiqueta.operationalStatus, "orphan_groups");
  const chip = chipDaCampanha(etiqueta.operationalStatus);
  assert.equal(chip.texto, "Grupos sumiram");
  assert.notEqual(chip.texto, "Pronta");

  // Mutante: voltar a linha para o texto incondicional "pessoas / capacidade".
  // Com os dois grupos órfãos isso é "0 / 0 vagas" — número inventado com cara
  // de medição. A linha certa não é do tipo "vagas".
  const vagas = linhaDeVagas(etiqueta, "ok");
  assert.equal(vagas.tipo, "sem-contagem");
  assert.notEqual(vagas.tipo, "vagas");
});

test("campanha com um grupo real continua com as vagas dele, e a ordem é por lotação", () => {
  // Mutante 1: fazer `campanhasDaInicio` decidir "sem grupos" pela capacidade
  // (o erro simétrico). Um órfão ao lado de um grupo que funciona é ruído — a
  // campanha trabalha, e as vagas contadas são as do grupo que resolveu.
  //
  // Mutante 2: ordenar por `pessoas` em vez de lotação. "Cheia" tem 195
  // pessoas contra 100 de "Com vaga", mas o bloco 7 é ordenado por LOTAÇÃO
  // (97% contra 50%) — com pessoas as duas ficariam na mesma ordem por acaso,
  // então "Meia" (0 pessoas, 0%) precisa existir para o mutante morrer no
  // último lugar.
  const etiquetas = campanhasDaInicio(
    [
      { id: "c1", name: "Com vaga", groupIds: ["w1@g.us", "sumiu"], slug: "com-vaga" },
      { id: "c2", name: "Cheia", groupIds: ["w2@g.us"], slug: "cheia" },
      { id: "c3", name: "Vazia", groupIds: [], slug: "vazia" },
    ],
    gruposDoPainel,
    [{ campaignGroupId: "c1", clicks: 7 }],
  );

  assert.deepEqual(
    etiquetas.map((e) => [e.campaign.name, e.operationalStatus, e.fillPct]),
    [
      ["Cheia", "full", 98],
      ["Com vaga", "ready", 50],
      ["Vazia", "empty", 0],
    ],
  );
  assert.equal(linhaDeVagas(etiquetas[1], "ok").tipo, "vagas");
  // Mutante: casar cliques por nome (o que o widget fazia). O link só tem
  // `campaignGroupId`, então a atribuição por nome devolveria 0.
  assert.equal(etiquetas[1].clicks, 7);
});

test("o bloco 7 corta em três etiquetas", () => {
  // Mutante: apagar o `.slice`. A Início vira a lista inteira de campanhas.
  const muitas = ["a", "b", "c", "d"].map((k) => ({ id: k, name: k, groupIds: ["w1@g.us"] }));
  assert.equal(campanhasDaInicio(muitas, gruposDoPainel, []).length, CAMPANHAS_NA_INICIO);
});
