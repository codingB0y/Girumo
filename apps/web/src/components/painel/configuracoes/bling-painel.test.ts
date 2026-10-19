// apps/web/src/components/painel/configuracoes/bling-painel.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CartaoBling } from "@/lib/bling/cartao";
import { PainelDoBling, type PropsDoBling } from "./bling-painel";

const noop = () => {};
/** 14:52 em Brasília. */
const AGORA = new Date("2026-10-13T17:52:00.000Z");

const CONECTADO: CartaoBling = {
  disponivel: true,
  conexao: {
    status: "ativa",
    empresa: "Moda Kids Atacado Ltda",
    conectada_em: "2026-10-13T12:00:00.000Z",
    ultima_venda_em: "2026-10-13T17:48:00.000Z",
    ultimo_aviso_em: "2026-10-13T17:48:00.000Z",
    tempo_real: "ok",
    pausada_ate: null,
    ultimo_erro: null,
  },
  historico: { lidos: 1240, concluido: true },
  ajustes: {
    situacoes: [
      { id: 9, nome: "Atendido", base: 9, conta: true, bloqueada: false },
      { id: 12, nome: "Cancelado", base: 12, conta: false, bloqueada: true },
    ],
    situacoes_versao: "3f0c9a1b2d4e5f60",
    high_value: 1500,
    meta_enabled: true,
    pixel: { escolhido: null, opcoes: [{ campaign_id: "c1", campanha: "VIP Goiânia", pixel_id: "1234567890" }] },
    canais: [
      { id: 200000001, nome: "Loja Yampi", tipo: "Yampi", ativo: true, pedidos: 42, exemplos: ["1532", "1530"], ultimo_pedido_em: "2026-10-18", fora_do_meta: true },
    ],
  },
  numeros_30d: {
    vendas: 214,
    vendido: 86420,
    com_origem: { anuncio: 61, grupo: 97 },
    sem_origem: 56,
    meta: { enviado: 207, fora_da_janela: 6, sem_pixel: 0, sem_dados: 1, desligado: 0, erro: 0 },
    pendentes: 0,
    falhas: 0,
  },
  listas: { alto_valor: 38, comprador: 412, lead: 129 },
  ultimas: [
    {
      hora: "2026-10-13T17:52:00.000Z",
      cliente: "Ana Paula Ferreira",
      telefone_mascarado: "(62) 9••••-4821",
      valor: 1840,
      tipo: "venda",
      origem: "anuncio",
      origem_detalhe: "VIP Goiânia — Conjunto 2",
      meta: "enviado",
      situacao: "Atendido",
    },
  ],
};

function html(cartao: CartaoBling, over: Partial<PropsDoBling> = {}): string {
  const props: PropsDoBling = {
    cartao,
    agora: AGORA,
    ocupado: null,
    ajustando: false,
    erroDosAjustes: null,
    onConectar: noop,
    onAjustar: noop,
    onSalvar: noop,
    onDesconectar: noop,
    onBaixar: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(PainelDoBling, props));
}

/** A tag do campo pelo id, sem depender da ordem dos atributos que o React escreve. */
function campo(h: string, id: string): string {
  const achado = h.match(new RegExp(`<(?:input|select)[^>]*id="${id}"[^>]*>`));
  assert.ok(achado, `campo ${id} não está na tela`);
  return achado[0];
}

const conexao = (over: Partial<NonNullable<CartaoBling["conexao"]>>): CartaoBling => ({
  ...CONECTADO,
  conexao: { ...CONECTADO.conexao!, ...over },
});

test("sem as variáveis do Bling: só o recado, nenhum botão", () => {
  const vazio = { ...CONECTADO, disponivel: false, conexao: null, ajustes: null, numeros_30d: null, listas: null, ultimas: [] };
  const h = html(vazio);
  assert.match(h, /<h2 id="bling-titulo"[^>]*>Bling<\/h2>/);
  assert.match(h, /Integração com o Bling indisponível no momento\./);
  assert.doesNotMatch(h, /<button/);
});

test("não conectado: promessa, três linhas e Conectar Bling", () => {
  const h = html({ ...CONECTADO, conexao: null, historico: null, ajustes: null, numeros_30d: null, listas: null, ultimas: [] });
  assert.match(h, /· não conectado/);
  assert.match(h, />Conectar Bling</);
  assert.match(h, /Monta 3 listas de clientes/);
  assert.match(h, /importamos as vendas dos últimos 90 dias/);
});

test("conectado: estado, números de 30 dias, última venda, listas e resumo dos ajustes", () => {
  const h = html(CONECTADO);
  assert.match(h, /· conectado a Moda Kids Atacado Ltda/);
  assert.match(h, />Conectado</);
  assert.match(h, /última venda há 4 min/);
  assert.match(h, />214</);
  assert.match(h, /Anúncio 61 · Grupo 97/);
  assert.match(h, /6 fora da janela de 7 dias do Meta · 1 sem telefone nem e-mail/);
  assert.match(h, /\(62\) 9••••-4821/);
  assert.match(h, /Anúncio · VIP Goiânia — Conjunto 2/);
  assert.match(h, /aria-label="Baixar CSV para o Meta: Leads qualificados"/);
  assert.match(h, /Evento InitiateCheckout · últimos 180 dias/);
  assert.match(h, /ligado · Pixel 1234567890/);
  assert.match(h, /aria-expanded="false"/);
  // Histórico concluído: nada de barra.
  assert.doesNotMatch(h, /role="progressbar"/);
  // Formulário fechado.
  assert.doesNotMatch(h, /Salvar ajustes/);
});

test("importando: barra indeterminada com os pedidos lidos; sem acesso, a barra some", () => {
  const importando = { ...CONECTADO, historico: { lidos: 1240, concluido: false } };
  assert.match(html(importando), /role="progressbar"[^>]*aria-valuetext="1.240 pedidos lidos"/);
  const parado = { ...importando, conexao: { ...CONECTADO.conexao!, status: "reconectar" as const } };
  assert.doesNotMatch(html(parado), /role="progressbar"/);
});

test("alertas: acesso recusado com Reconectar, tempo real parado, pausa e último erro", () => {
  const sem = html(conexao({ status: "reconectar", ultimo_erro: "invalid_grant" }));
  assert.match(sem, /role="alert"[^>]*>.*O Bling recusou o acesso da Girumo/);
  assert.match(sem, />Reconectar Bling</);
  assert.match(sem, />Sem acesso</);
  assert.match(sem, /Último erro: invalid_grant/);
  // Sem acesso não diz "Recebendo".
  assert.doesNotMatch(sem, />Recebendo</);

  const parado = html(conexao({ tempo_real: "parado", ultimo_aviso_em: "2026-10-13T11:52:00.000Z" }));
  assert.match(parado, /Tempo real parado há 6 h/);
  assert.doesNotMatch(parado, /Reconectar Bling/);

  assert.match(html(conexao({ pausada_ate: "2026-10-13T18:05:00.000Z" })), /Pausado até 15:05 por erros seguidos do Bling/);
});

test("ajustes abertos: situação travada, switch do Meta, pixel e o erro da rota", () => {
  const h = html(CONECTADO, { ajustando: true, erroDosAjustes: "Situação inválida: Cancelado e Em digitação nunca contam como venda." });
  assert.match(h, /aria-expanded="true"/);
  assert.match(campo(h, "bling-situacao-9"), /checked=""/);
  assert.doesNotMatch(campo(h, "bling-situacao-9"), /disabled=""/);
  assert.match(campo(h, "bling-situacao-12"), /disabled=""/);
  assert.doesNotMatch(campo(h, "bling-situacao-12"), /checked=""/);
  assert.match(h, /nunca conta: vira lead qualificado/);
  assert.match(campo(h, "bling-valor-alto"), /value="1.500,00"/);
  assert.match(campo(h, "bling-meta"), /role="switch"/);
  assert.match(campo(h, "bling-meta"), /checked=""/);
  // `escolhido: null` = automático, a opção vazia selecionada.
  assert.match(h, /<option value="" selected="">Automático · Pixel 1234567890<\/option>/);
  assert.match(h, /<option value="c1">VIP Goiânia · Pixel 1234567890<\/option>/);
  assert.match(h, /role="alert"[^>]*>Situação inválida/);
  assert.match(h, />Salvar ajustes</);
  assert.match(h, />Desconectar Bling</);
});

test("Salvar recusado porque as situações mudaram no meio (409): a frase vai para o formulário, como a do 400", () => {
  const frase = "As situações do Bling mudaram desde que você abriu os ajustes. Recarregue a página e confira quais contam como venda.";
  assert.match(html(CONECTADO, { ajustando: true, erroDosAjustes: frase }), /role="alert"[^>]*>As situações do Bling mudaram desde que você abriu os ajustes\./);
});

test("sem campanha com pixel: o formulário manda configurar numa campanha", () => {
  const semPixel = { ...CONECTADO, ajustes: { ...CONECTADO.ajustes!, pixel: { escolhido: null, opcoes: [] } } };
  const h = html(semPixel, { ajustando: true });
  assert.match(h, /Nenhuma campanha tem o pixel e o token do Meta/);
  assert.doesNotMatch(h, /<select/);
});
