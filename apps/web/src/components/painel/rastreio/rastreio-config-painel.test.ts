import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { RespostaDaConfig } from "@/lib/rastreio/config-painel";
import { MATRIZ_PADRAO } from "@/lib/rastreio/tipos";
import { PainelDoRastreio, type ErroDoRastreio } from "./rastreio-config-painel";

const noop = () => {};
const DADOS: RespostaDaConfig = {
  config: {
    publicSlug: "loja-exemplo",
    matrix: MATRIZ_PADRAO,
    notifyStoreOnProblem: true,
    vipLinkId: null,
    storeWhatsapp: null,
    importedAt: "2026-10-29T15:00:00.000Z",
  },
  linkDaBusca: "https://www.girumo.com.br/rastreio/loja-exemplo",
  loja: "Loja Exemplo",
  yampi: "ativa",
  linksDeConvite: [{ id: "0b0e6d0a-6f6b-4c53-9a39-1d6a2a3b0001", slug: "vip-exemplo" }],
};

function render(o: { dados?: Partial<RespostaDaConfig>; config?: Partial<RespostaDaConfig["config"]>; erro?: ErroDoRastreio } = {}) {
  const dados = { ...DADOS, ...o.dados, config: { ...DADOS.config, ...o.config } };
  return renderToStaticMarkup(
    createElement(PainelDoRastreio, {
      dados, cartaoDoNumero: null, salvando: null, erro: o.erro ?? null, aoAlternar: noop, aoAlternarProblema: noop,
      aoSalvarNumero: noop, aoEscolherConvite: noop, aoCopiar: noop,
    }),
  );
}

const interruptor = (h: string, rotulo: string) => {
  const m = h.match(new RegExp(`<button[^>]*role="switch"[^>]*aria-checked="(true|false)"[^>]*aria-label="${rotulo}"`));
  assert.ok(m, `interruptor "${rotulo}" ausente`);
  return m[1] === "true";
};

test("os interruptores seguem a matriz, com o nome acessível do contrato", () => {
  const h = render();
  assert.equal(interruptor(h, "WhatsApp em Pedido enviado"), true);
  assert.equal(interruptor(h, "E-mail em Pedido confirmado"), false);
  assert.equal(interruptor(h, "E-mail em Entregue"), false);
  assert.equal(interruptor(h, "WhatsApp em Problema na entrega"), true);
  assert.equal(interruptor(h, "Me avisar quando um pedido tiver problema na entrega"), true);
  assert.equal((h.match(/role="switch"/g) ?? []).length, 12);
});

test("as duas seções têm título h3", () => {
  const h = render();
  assert.match(h, /<h3 id="rastreio-avisos-titulo"[^>]*>Avisos automáticos<\/h3>/);
  assert.match(h, /<h3 id="rastreio-pagina-titulo"[^>]*>Página de rastreio<\/h3>/);
});

test("sem Yampi: pede para conectar, com o link de Integrações; o Abrir continua", () => {
  const h = render({ dados: { yampi: null } });
  assert.match(h, /Conecte a Yampi para os pedidos chegarem aqui\./);
  assert.match(h, /href="\/painel\/configuracoes\?secao=integracoes"/);
  assert.match(h, /target="_blank" rel="noopener noreferrer"[^>]*>Abrir</);
});

test("Yampi ativa não mostra aviso; aviso_desativado pede atenção", () => {
  assert.doesNotMatch(render(), /Conecte a Yampi|precisa de atenção/);
  assert.match(render({ dados: { yampi: "aviso_desativado" } }), /A conexão com a Yampi precisa de atenção\./);
});

test("importação em andamento", () => {
  assert.match(render({ config: { importedAt: null } }), /Importando os pedidos dos últimos 30 dias/);
  assert.doesNotMatch(render(), /Importando os pedidos/);
});

test("link da busca visível", () => {
  assert.match(render(), /https:\/\/www\.girumo\.com\.br\/rastreio\/loja-exemplo/);
});

test("sem links de campanha, o convite fica desabilitado e explica por quê", () => {
  const h = render({ dados: { linksDeConvite: [] } });
  assert.match(h, /<select[^>]*disabled=""/);
  assert.match(h, /Crie uma campanha com link para oferecer o convite/);
});

test("recusa do número aparece no campo; outra recusa vira alerta da tela", () => {
  const erro = "Esse número está conectado na Girumo (grupos ou avisos).";
  const h = render({ erro: { error: erro, campo: "storeWhatsapp" } });
  assert.match(h, /aria-invalid="true"/);
  assert.match(h, /id="rastreio-whatsapp-erro" role="alert"[^>]*>Esse número está conectado/);
  const g = render({ erro: { error: "Escolha os avisos de todas as etapas.", campo: "matrix" } });
  assert.doesNotMatch(g, /aria-invalid/);
  assert.match(g, /role="alert"[^>]*>Escolha os avisos de todas as etapas\./);
});

test("o e-mail tem prévia: a coluna Ver mensagem aparece", () => {
  assert.match(render(), /aria-label="Ver mensagem de Pedido enviado"/);
});

test("salvando uma chave, todos os interruptores ficam inertes sem perder o foco", () => {
  const h = renderToStaticMarkup(
    createElement(PainelDoRastreio, {
      dados: DADOS, cartaoDoNumero: null, salvando: "storeWhatsapp", erro: null, aoAlternar: noop,
      aoAlternarProblema: noop, aoSalvarNumero: noop, aoEscolherConvite: noop, aoCopiar: noop,
    }),
  );
  assert.equal((h.match(/role="switch"[^>]*aria-disabled="true"/g) ?? []).length, 12);
  assert.doesNotMatch(h, /role="switch"[^>]*disabled=""/);
});

test("convite apontando para link que sumiu não finge ser o primeiro da lista", () => {
  const h = render({ config: { vipLinkId: "0b0e6d0a-6f6b-4c53-9a39-1d6a2a3b9999" } });
  assert.match(h, /<option value="0b0e6d0a-6f6b-4c53-9a39-1d6a2a3b9999" selected="">Link removido<\/option>/);
});
