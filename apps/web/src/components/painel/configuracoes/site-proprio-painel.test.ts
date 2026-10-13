// apps/web/src/components/painel/configuracoes/site-proprio-painel.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PainelDoSite,
  SiteComErro,
  SiteSemAcesso,
  chaveMascarada,
  haQuanto,
  quando,
  situacaoDoSite,
  type LeituraDoSite,
  type PropsDoPainel,
} from "./site-proprio-painel";

const noop = () => {};
/** 14:52 em Brasília. */
const AGORA = new Date("2026-10-10T17:52:00.000Z");
const LEITURA: LeituraDoSite = {
  ativa: true,
  key_last4: "7f2a",
  gerada_em: "2026-10-10T12:00:00.000Z",
  link: { id: "l1", slug: "vip-atacado" },
  last_used_at: "2026-10-10T17:49:00.000Z",
  recebidos_30d: 612,
  ultimos: [
    { hora: "2026-10-10T17:47:00.000Z", telefone_mascarado: "(62) 9••••-4821", anuncio: "Verão Kids — vídeo 15s", situacao: "Entrou no grupo às 14:48" },
  ],
  links: [{ id: "l1", slug: "vip-atacado" }, { id: "l2", slug: "moda-sul" }],
};

function html(over: Partial<PropsDoPainel> = {}, leitura: Partial<LeituraDoSite> = {}): string {
  const props: PropsDoPainel = {
    leitura: { ...LEITURA, ...leitura },
    agora: AGORA,
    origem: "https://app.girumo.com.br",
    linkEscolhido: "l1",
    onLink: noop,
    chaveNova: null,
    ocupado: null,
    teste: null,
    onGerar: noop,
    onTestar: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(PainelDoSite, props));
}

test("há quanto tempo: minutos, horas e dias", () => {
  assert.equal(haQuanto("2026-10-10T17:51:30.000Z", AGORA), "há menos de 1 min");
  assert.equal(haQuanto("2026-10-10T17:49:00.000Z", AGORA), "há 3 min");
  assert.equal(haQuanto("2026-10-10T12:52:00.000Z", AGORA), "há 5 h");
  assert.equal(haQuanto("2026-10-07T17:52:00.000Z", AGORA), "há 3 dias");
});

test("situação: recebendo, parado há mais de um dia, esperando e desligada", () => {
  assert.deepEqual(situacaoDoSite(LEITURA, AGORA), {
    titulo: "Recebendo cadastros",
    detalhe: "Último há 3 min · 612 nos últimos 30 dias",
    tom: "ok",
  });
  assert.equal(situacaoDoSite({ ...LEITURA, last_used_at: "2026-10-08T17:52:00.000Z" }, AGORA).titulo, "Sem cadastros há mais de um dia");
  assert.equal(situacaoDoSite({ ...LEITURA, last_used_at: "2026-10-08T17:52:00.000Z" }, AGORA).tom, "alerta");
  // Chave recém-gerada zera `last_used_at` (salvarChave): o site ainda não usou a nova.
  assert.equal(situacaoDoSite({ ...LEITURA, last_used_at: null }, AGORA).titulo, "Esperando o primeiro cadastro");
  assert.equal(situacaoDoSite({ ...LEITURA, ativa: false, last_used_at: null }, AGORA).titulo, "Integração desligada");
});

test("hora da lista: só HH:MM hoje; DD/MM HH:MM em outro dia (Brasília)", () => {
  assert.equal(quando("2026-10-10T17:47:00.000Z", AGORA), "14:47");
  assert.equal(quando("2026-10-09T17:47:00.000Z", AGORA), "09/10 14:47");
});

test("chave mascarada mostra só os 4 últimos", () => {
  assert.equal(chaveMascarada("7f2a"), "gk_live_••••••••••••••••7f2a");
});

test("seção com situação, chave mascarada, seletor e Gerar outra chave", () => {
  const h = html();
  assert.match(h, /data-testid="configuracoes-site"/);
  assert.match(h, /Site próprio/);
  assert.match(h, /Recebendo cadastros/);
  assert.match(h, /Último há 3 min · 612 nos últimos 30 dias/);
  assert.match(h, /gk_live_••••••••••••••••7f2a/);
  assert.match(h, /Gerada em 10\/10/);
  assert.match(h, /Mandar pro grupo pelo link/);
  assert.match(h, /<option value="l2">moda-sul<\/option>/);
  assert.match(h, />Gerar outra chave</);
  assert.doesNotMatch(h, /Trocar o link só vale com uma chave nova/);
});

test("link diferente do atual avisa que precisa de chave nova", () => {
  assert.match(html({ linkEscolhido: "l2" }), /Trocar o link só vale com uma chave nova/);
});

test("chave recém-gerada aparece inteira uma vez, com Copiar e o aviso", () => {
  const chave = "gk_live_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
  const h = html({ chaveNova: chave });
  assert.ok(h.includes(chave));
  assert.match(h, /aria-label="Copiar a chave"/);
  assert.match(h, /não aparece de novo/);
  assert.doesNotMatch(h, /gk_live_••••/);
});

test("sem integração: Gerar chave, e o teste fica desligado", () => {
  const h = html({}, { ativa: false, key_last4: null, gerada_em: null, link: null, last_used_at: null });
  assert.match(h, />Gerar chave</);
  assert.match(h, /<button[^>]*disabled=""[^>]*>Enviar cadastro de teste</);
  assert.match(h, /Integração desligada/);
});

test("sem link de grupo: não dá para gerar a chave", () => {
  const h = html({ linkEscolhido: "" }, { ativa: false, key_last4: null, link: null, last_used_at: null, links: [] });
  assert.match(h, /Crie um link de grupo antes de gerar a chave/);
  assert.match(h, /<button[^>]*disabled=""[^>]*>Gerar chave</);
});

test("parâmetros de URL e contrato do envio com a origem do app", () => {
  const h = html();
  assert.match(h, /utm_source=\{\{site_source_name\}\}&amp;utm_medium=paid&amp;utm_campaign=\{\{campaign\.name\}\}/);
  assert.match(h, /aria-label="Copiar parâmetros"/);
  assert.match(h, /POST https:\/\/app\.girumo\.com\.br\/api\/integracoes\/cadastro/);
  assert.match(h, /nunca do navegador/);
});

test("últimos cadastros: hora, telefone mascarado, anúncio e situação; vazio diz que não chegou nada", () => {
  const h = html();
  assert.match(h, /14:47/);
  assert.match(h, /\(62\) 9••••-4821/);
  assert.match(h, /Entrou no grupo às 14:48/);
  assert.match(html({}, { ultimos: [] }), /Nenhum cadastro recebido ainda/);
});

test("resultado do teste mostra a resposta e avisa que nada foi gravado", () => {
  const h = html({
    teste: {
      enviado: { whatsapp: "62999998888" },
      resposta: { status: 201, corpo: { redirect: "https://app.girumo.com.br/r/vip-atacado?cid=00000000-0000-0000-0000-000000000000" } },
    },
  });
  assert.match(h, /Nada foi gravado/);
  assert.match(h, /vip-atacado\?cid=00000000/);
});

test("sem acesso (operador, ou 403 da rota): recado, sem chave, sem erro e sem botão", () => {
  const h = renderToStaticMarkup(createElement(SiteSemAcesso));
  assert.match(h, /data-testid="configuracoes-site"/);
  assert.match(h, /Site próprio/);
  assert.match(h, /Só o dono ou a administração da loja mexe na integração do site/);
  assert.doesNotMatch(h, /Não deu para carregar/);
  assert.doesNotMatch(h, /gk_live_/);
  assert.doesNotMatch(h, /<button/);
});

test("erro de carga: avisa e oferece Tentar de novo, sem fingir integração desligada", () => {
  const h = renderToStaticMarkup(createElement(SiteComErro, { onTentar: noop }));
  assert.match(h, /data-testid="configuracoes-site"/);
  assert.match(h, /role="alert"[^>]*>Não deu para carregar a integração do site/);
  assert.match(h, /<button[^>]*>Tentar de novo<\/button>/);
  assert.doesNotMatch(h, /Integração desligada/);
});
