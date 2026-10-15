// apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { lerFormulario, type RespostaDoGasto } from "@/lib/resultados/gasto-de-anuncio";
import { BotaoLancarGasto, ConteudoDoGasto, RodapeDoGasto, type PropsDoConteudo } from "./dialogo-de-gasto";

const noop = () => {};

const RESPOSTA: RespostaDoGasto = {
  lancamentos: [
    { id: "l1", utm_campaign: "VIP Atacado — Goiânia", starts_on: "2026-09-11", ends_on: "2026-10-10", amount: 1620 },
    { id: "l2", utm_campaign: "Remarketing", starts_on: "2026-10-01", ends_on: "2026-10-10", amount: 240.5 },
  ],
  campanhas: ["Remarketing", "VIP Atacado — Goiânia"],
};

function html(over: Partial<PropsDoConteudo> = {}): string {
  const props: PropsDoConteudo = {
    carga: "ok",
    resposta: RESPOSTA,
    form: { campanha: "Remarketing", valor: "", de: "2026-09-11", ate: "2026-10-10" },
    editando: null,
    excluindo: null,
    salvando: false,
    erro: null,
    onCampo: noop,
    onSalvar: noop,
    onCancelarEdicao: noop,
    onEditar: noop,
    onPedirExclusao: noop,
    onExcluir: noop,
    onFechar: noop,
    aoTentarDeNovo: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(ConteudoDoGasto, props));
}

test("lista os lançamentos com campanha, período e valor; editar e excluir dizem de qual", () => {
  const h = html();
  assert.match(h, /VIP Atacado — Goiânia/);
  assert.match(h, /11\/09 a 10\/10/);
  assert.match(h, /R\$\s1\.620,00/);
  assert.match(h, /R\$\s240,50/);
  assert.match(h, /aria-label="Editar gasto de VIP Atacado — Goiânia, 11\/09 a 10\/10"/);
  assert.match(h, /aria-label="Excluir gasto de Remarketing, 01\/10 a 10\/10"/);
  assert.match(h, /aria-labelledby="gasto-lancamentos"/);
  // Alvo do foco depois de excluir (a linha some com o botão clicado).
  assert.match(h, /<h3 id="gasto-lancamentos" tabindex="-1"/);
});

test("a campanha é escolhida da lista que já chegou, com a atual marcada", () => {
  const h = html();
  assert.match(h, /<label for="gasto-campanha"[^>]*>Campanha<\/label>/);
  assert.match(h, /<option value="Remarketing" selected="">Remarketing<\/option>/);
  assert.match(h, /<option value="VIP Atacado — Goiânia">VIP Atacado — Goiânia<\/option>/);
  assert.match(h, /<option value="">Escolha a campanha…<\/option>/);
  assert.match(h, /A lista vem dos nomes de campanha que já chegaram nos cadastros\./);
  assert.match(h, /<button type="submit"[^>]*>Salvar gasto<\/button>/);
});

test("lançamento novo nasce sem campanha escolhida; salvar sem escolher mostra o motivo", () => {
  const vazio = { campanha: "", valor: "1.620", de: "2026-09-11", ate: "2026-10-10" };
  const h = html({ form: vazio });
  assert.match(h, /<option value="" selected="">Escolha a campanha…<\/option>/);
  assert.doesNotMatch(h, /<option value="Remarketing" selected="">/);
  // Salvar fica habilitado: é o clique que mostra o motivo, em vez de um botão morto sem explicação.
  assert.doesNotMatch(h, /<button type="submit" disabled=""/);
  // O erro que o diálogo põe na tela é o de `lerFormulario` para a campanha vazia.
  const lido = lerFormulario(vazio);
  assert.equal(lido.ok, false);
  assert.match(html({ form: vazio, erro: lido.ok ? null : lido.erro }), /role="alert"[^>]*>Escolha a campanha\.</);
});

test("sem nenhuma campanha recebida: diz por quê e não deixa salvar", () => {
  const h = html({ resposta: { lancamentos: [], campanhas: [] }, form: { campanha: "", valor: "", de: "2026-09-11", ate: "2026-10-10" } });
  assert.match(h, /Nenhum nome de campanha chegou nos cadastros ainda/);
  assert.doesNotMatch(h, /<select/);
  assert.match(h, /<button type="submit" disabled=""[^>]*>Salvar gasto<\/button>/);
  assert.match(h, /Nenhum gasto lançado ainda\./);
});

test("valor digitado aparece lido em reais, para \"1.620\" não virar R$ 1,62", () => {
  assert.match(html({ form: { campanha: "Remarketing", valor: "1.620", de: "2026-09-11", ate: "2026-10-10" } }), /= R\$\s1\.620,00/);
  assert.doesNotMatch(html({ form: { campanha: "Remarketing", valor: "abc", de: "2026-09-11", ate: "2026-10-10" } }), /= R\$/);
});

test("editando: salvar vira alteração e cancelar desfaz a edição", () => {
  const h = html({ editando: "l1" });
  assert.match(h, />Salvar alteração<\/button>/);
  assert.match(h, />Cancelar edição<\/button>/);
  assert.doesNotMatch(h, />Salvar gasto</);
});

test("excluir pede confirmação na própria linha, sem abrir outro diálogo", () => {
  const h = html({ excluindo: "l2" });
  assert.match(h, /Excluir este lançamento\?/);
  assert.match(h, /aria-label="Excluir mesmo o gasto de Remarketing, 01\/10 a 10\/10"/);
  assert.match(h, /aria-label="Manter o gasto de Remarketing, 01\/10 a 10\/10"/);
  assert.doesNotMatch(h, /aria-label="Editar gasto de Remarketing/);
  assert.match(h, /aria-label="Editar gasto de VIP Atacado — Goiânia/);
});

test("erro ao carregar: Tentar de novo, nunca lista vazia nem formulário", () => {
  const h = html({ carga: "erro" });
  assert.match(h, /Não deu para carregar os lançamentos\./);
  assert.match(h, />Tentar de novo<\/button>/);
  assert.doesNotMatch(h, /Nenhum gasto lançado|<form|<select/);
});

test("primeira carga anuncia; recarregar depois de salvar mantém a lista", () => {
  assert.match(html({ carga: "carregando", resposta: null }), /role="status"[^>]*>Carregando os lançamentos…/);
  const recarregando = html({ carga: "carregando" });
  assert.match(recarregando, /Remarketing/);
  assert.doesNotMatch(recarregando, /role="status"/);
});

test("erro de salvar aparece como alerta", () => {
  assert.match(html({ erro: "A data final vem antes da inicial." }), /role="alert"[^>]*>A data final vem antes da inicial\./);
});

test("botão do cabeçalho e rodapé do cartão abrem o diálogo", () => {
  const botao = renderToStaticMarkup(createElement(BotaoLancarGasto, { onClick: noop }));
  assert.match(botao, /aria-haspopup="dialog"/);
  assert.match(botao, />Lançar gasto<\/button>/);
  assert.match(
    renderToStaticMarkup(createElement(RodapeDoGasto, { quantos: 3, onLancar: noop })),
    /^3 lançamentos · <button[^>]*>lançar<\/button>$/,
  );
  assert.match(renderToStaticMarkup(createElement(RodapeDoGasto, { quantos: 0, onLancar: noop })), /^nenhum lançamento · /);
});
