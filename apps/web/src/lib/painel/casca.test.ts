import assert from "node:assert/strict";
import { test } from "node:test";

import { abreviaNome, iniciaisDaLoja, lerStatusDoRecuperar, liberacoesDaCasca, romaneioDoPlano } from "./casca";

test("iniciaisDaLoja pega as duas primeiras palavras, em maiúscula", () => {
  assert.equal(iniciaisDaLoja("Mega Stock Atacado"), "MS");
  assert.equal(iniciaisDaLoja("  girumo  "), "G");
  assert.equal(iniciaisDaLoja(""), "•");
  assert.equal(iniciaisDaLoja(null), "•");
});

test("abreviaNome guarda só o primeiro nome e a inicial do segundo", () => {
  assert.equal(abreviaNome("Josiane Maria Silva"), "Josiane M.");
  assert.equal(abreviaNome("  josiane  "), "josiane");
  assert.equal(abreviaNome(""), "Alguém");
  assert.equal(abreviaNome(null), "Alguém");
});

test("romaneio: nome do plano em caixa alta e a data de renovação", () => {
  // Instante fixo (12:00 de Brasília em 04/10): `new Date(2026, 9, 4)` dependia
  // do fuso de quem roda o teste.
  const fim = "2026-10-04T15:00:00.000Z";
  assert.equal(romaneioDoPlano({ status: "active", current_period_end: fim, plans: { name: "Growth" } }), "GROWTH · renova 04/10");
  assert.equal(
    romaneioDoPlano({ status: "trialing", current_period_end: fim, plans: { name: "Starter" } }),
    "STARTER · teste até 04/10",
  );
  assert.equal(
    romaneioDoPlano({ status: "active", cancel_at_period_end: true, current_period_end: fim, plans: { name: "Pro" } }),
    "PRO · até 04/10",
  );
  assert.equal(romaneioDoPlano({ status: "active", current_period_end: null, plans: { name: "Pro" } }), "PRO");
  assert.equal(romaneioDoPlano(null), "SEM PLANO · escolher");
});

test("romaneio: data no fuso de Brasília, não no do navegador", () => {
  // 22:30 de 04/10 em Brasília já é 05/10 em UTC: com `getDate()` o rodapé dizia
  // "05/10" a quem roda em UTC, um dia depois de Configurações e da faixa.
  const quaseMeiaNoite = "2026-10-05T01:30:00.000Z";
  assert.equal(
    romaneioDoPlano({ status: "active", current_period_end: quaseMeiaNoite, plans: { name: "Growth" } }),
    "GROWTH · renova 04/10",
  );
});

test("romaneio: assinatura cancelada não renova nem concede plano", () => {
  // O teste com cartão repetido termina `canceled` com o plano ainda apontado: o
  // rodapé dizia "GROWTH · renova DD/MM" enquanto a faixa dizia "Não cobramos nada"
  // e Configurações, "Inativa". Cancelada é o mesmo acesso de quem não tem plano.
  const fim = "2026-10-10T15:00:00.000Z";
  assert.equal(
    romaneioDoPlano({ status: "canceled", current_period_end: fim, plans: { name: "Growth" } }),
    "SEM PLANO · escolher",
  );
  assert.equal(
    romaneioDoPlano({ status: "canceled", current_period_end: null, plans: { name: "Growth" } }),
    "SEM PLANO · escolher",
  );
});

// --- Estado do Recuperar na casca ---

const LIGADO = { enabled: true, precisaDeVoce: 4 };
const base = {
  perguntouInstagram: true,
  instagram: { enabled: true },
  perguntouRecuperar: true,
  recuperar: LIGADO,
  recuperarFalhou: false,
  rastreio: false,
};

test("lerStatusDoRecuperar aceita o corpo da rota e descarta lixo", () => {
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true, precisaDeVoce: 4 }), LIGADO);
  assert.deepEqual(lerStatusDoRecuperar({ enabled: false, precisaDeVoce: 9 }), { enabled: false, precisaDeVoce: 0 });
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true }), { enabled: true, precisaDeVoce: 0 });
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true, precisaDeVoce: -3 }), { enabled: true, precisaDeVoce: 0 });
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true, precisaDeVoce: 2.9 }), { enabled: true, precisaDeVoce: 2 });
  for (const lixo of [null, undefined, "sim", 3, [], { enabled: "sim" }, { precisaDeVoce: 2 }]) {
    assert.equal(lerStatusDoRecuperar(lixo), null, JSON.stringify(lixo));
  }
});

test("liberacoesDaCasca espera as respostas que o acesso precisa antes de decidir", () => {
  assert.equal(liberacoesDaCasca({ ...base, recuperar: null }), null);
  assert.equal(liberacoesDaCasca({ ...base, instagram: null }), null);
  assert.deepEqual(liberacoesDaCasca(base), { instagram: true, recuperar: true, rastreio: false });
});

test("liberacoesDaCasca: Recuperar que falhou não trava o Instagram; falha depois de um estado conhecido mantém o estado", () => {
  assert.deepEqual(liberacoesDaCasca({ ...base, recuperar: null, recuperarFalhou: true }), { instagram: true, recuperar: false, rastreio: false });
  assert.deepEqual(liberacoesDaCasca({ ...base, recuperarFalhou: true }), { instagram: true, recuperar: true, rastreio: false });
});

test("liberacoesDaCasca: a vendedora só pergunta o que o acesso dela alcança", () => {
  const vendedora = { ...base, perguntouInstagram: false, instagram: null };
  assert.deepEqual(liberacoesDaCasca(vendedora), { instagram: false, recuperar: true, rastreio: false });
  assert.equal(liberacoesDaCasca({ ...vendedora, perguntouRecuperar: false, recuperar: null }), null);
});

test("liberacoesDaCasca: o Rastreio passa adiante e não segura o menu", () => {
  assert.deepEqual(liberacoesDaCasca({ ...base, rastreio: true }), { instagram: true, recuperar: true, rastreio: true });
  assert.equal(liberacoesDaCasca({ ...base, rastreio: true, instagram: null }), null);
});
