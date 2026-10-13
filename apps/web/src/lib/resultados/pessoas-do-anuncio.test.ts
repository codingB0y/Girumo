import assert from "node:assert/strict";
import { test } from "node:test";

import {
  anuncioDaBusca,
  buscaDoAnuncio,
  ehContatosDoAnuncio,
  ehPessoasDaGaveta,
  filtroDaUrl,
  hrefDeContatos,
  lerPessoasDoAnuncio,
  paraAGaveta,
} from "./pessoas-do-anuncio";

/** O JSON de `attribution_people`, com um comprador em Contatos e outro só com o telefone do pedido. */
const BRUTO = {
  por_origem: [{ origem: "ig", cadastros: 2, vendido: 600 }],
  compradores: [
    {
      lead_id: "lead-1",
      nome: "Maria Kids",
      telefone: "556299911111",
      grupo: "VIP 1",
      cadastro_em: "2026-01-05T13:00:00+00:00",
      primeira_compra: "2026-01-14T18:00:00+00:00",
      pedidos: 1,
      vendido: 600,
    },
    {
      lead_id: null,
      nome: null,
      telefone: "5562977771107",
      grupo: null,
      cadastro_em: "2026-01-06T13:00:00+00:00",
      primeira_compra: "2026-01-07T18:00:00+00:00",
      pedidos: 2,
      vendido: 960,
    },
  ],
  sem_compra: ["lead-2", "lead-3"],
};

const PERIODO = { de: "2026-09-11", ate: "2026-10-10" };

test("contrato: aceita o JSON da função; formato quebrado vira erro com o caminho", () => {
  const p = lerPessoasDoAnuncio(BRUTO);
  assert.equal(p.compradores.length, 2);
  assert.deepEqual(p.sem_compra, ["lead-2", "lead-3"]);
  // Estorno lançado como pedido negativo (decisão do PR 5) passa como veio.
  assert.equal(lerPessoasDoAnuncio({ ...BRUTO, por_origem: [{ origem: null, cadastros: 1, vendido: -40 }] }).por_origem[0].vendido, -40);
  assert.throws(
    () => lerPessoasDoAnuncio({ ...BRUTO, compradores: [{ ...BRUTO.compradores[0], pedidos: "1" }] }),
    /pessoas invalidas: compradores\.0\.pedidos/,
  );
  assert.throws(() => lerPessoasDoAnuncio(null), /pessoas invalidas/);
});

test("gaveta: telefone mascarado, sem id de contato, sem_compra vira contagem", () => {
  const g = paraAGaveta(lerPessoasDoAnuncio(BRUTO));
  assert.deepEqual(
    g.compradores.map((c) => [c.nome, c.telefone, c.grupo, c.em_contatos, c.pedidos, c.vendido]),
    [
      ["Maria Kids", "(62) ••••-1111", "VIP 1", true, 1, 600],
      [null, "(62) 9••••-1107", null, false, 2, 960],
    ],
  );
  assert.equal(g.contatos_dos_compradores, 1);
  assert.equal(g.sem_compra, 2);
  assert.deepEqual(g.por_origem, BRUTO.por_origem);
  // Nada que identifique alguém além do que a tela mostra.
  assert.doesNotMatch(JSON.stringify(g), /lead-|lead_id|556299911111|5562977771107/);
});

test("duas chaves de telefone no mesmo contato: 'Ver os N em Contatos' conta o contato uma vez", () => {
  const g = paraAGaveta(
    lerPessoasDoAnuncio({
      ...BRUTO,
      compradores: [BRUTO.compradores[0], { ...BRUTO.compradores[0], telefone: "5511988887777", vendido: 50 }],
    }),
  );
  assert.equal(g.compradores.length, 2);
  assert.equal(g.contatos_dos_compradores, 1);
});

test("busca do anúncio: nulo fica fora da URL, caractere especial vai codificado e volta igual", () => {
  const chave = { campanha: "VIP Atacado — Goiânia", conjunto: null, anuncio: "50% off & frete+grátis" };
  const busca = buscaDoAnuncio(PERIODO, chave, "compraram");
  assert.equal(
    busca,
    "de=2026-09-11&ate=2026-10-10&campanha=VIP+Atacado+%E2%80%94+Goi%C3%A2nia&anuncio=50%25+off+%26+frete%2Bgr%C3%A1tis&lista=compraram",
  );
  assert.deepEqual(anuncioDaBusca(new URLSearchParams(busca)), { ok: true, chave, lista: "compraram" });
  assert.equal(
    buscaDoAnuncio(PERIODO, { campanha: null, conjunto: null, anuncio: null }),
    "de=2026-09-11&ate=2026-10-10",
  );
  assert.equal(
    hrefDeContatos(PERIODO, chave, "sem-compra"),
    "/painel/contatos?de=2026-09-11&ate=2026-10-10&campanha=VIP+Atacado+%E2%80%94+Goi%C3%A2nia&anuncio=50%25+off+%26+frete%2Bgr%C3%A1tis&lista=sem-compra",
  );
});

test("busca lida: vazio vira nulo e o resto vai como veio (o SQL apara); lista desconhecida e acima de 2000 recusados", () => {
  assert.deepEqual(anuncioDaBusca(new URLSearchParams("campanha=&anuncio=%20A1%20")), {
    ok: true,
    chave: { campanha: null, conjunto: null, anuncio: " A1 " },
    lista: null,
  });
  assert.deepEqual(anuncioDaBusca(new URLSearchParams("lista=todos")), { ok: false, erro: "Lista inválida." });
  assert.deepEqual(anuncioDaBusca(new URLSearchParams(`anuncio=${"x".repeat(2001)}`)), {
    ok: false,
    erro: "Anúncio inválido.",
  });
  // Página /p/ não corta UTM em 200: nome longo de anúncio continua tendo gaveta.
  assert.equal(anuncioDaBusca(new URLSearchParams(`anuncio=${"x".repeat(2000)}`)).ok, true);
});

test("filtro do Contatos pela URL: só com lista válida; a busca volta inteira para a rota", () => {
  const busca = buscaDoAnuncio(PERIODO, { campanha: "C1", conjunto: null, anuncio: "A1" }, "sem-compra");
  assert.deepEqual(filtroDaUrl(`?${busca}`), {
    chave: { campanha: "C1", conjunto: null, anuncio: "A1" },
    lista: "sem-compra",
    busca,
  });
  assert.equal(filtroDaUrl(""), null);
  assert.equal(filtroDaUrl("?anuncio=A1"), null, "sem lista não é filtro (é a gaveta)");
  assert.equal(filtroDaUrl("?anuncio=A1&lista=todos"), null);
});

test("guardas do navegador: aceitam o formato da rota, recusam erro e lixo", () => {
  assert.equal(ehPessoasDaGaveta(paraAGaveta(lerPessoasDoAnuncio(BRUTO))), true);
  assert.equal(ehPessoasDaGaveta({ error: "Não deu para carregar quem veio por este anúncio." }), false);
  assert.equal(ehPessoasDaGaveta(null), false);
  assert.equal(ehContatosDoAnuncio({ contatos: [] }), true);
  assert.equal(ehContatosDoAnuncio({ error: "x" }), false);
  assert.equal(ehContatosDoAnuncio(undefined), false);
});
