// apps/web/src/components/painel/configuracoes/yampi-painel.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CartaoYampi } from "@/lib/yampi/cartao";
import { PainelDaYampi, type PropsDaYampi } from "./yampi-painel";
import { chipDaYampi, mensagemDoTeste } from "./yampi-painel-texto";

const noop = () => {};
/** 14:52 em Brasília. */
const AGORA = new Date("2026-10-29T17:52:00.000Z");

const ATIVA: CartaoYampi = {
  disponivel: true,
  conexao: {
    status: "ativa", alias: "loja-exemplo", token_final: "9aZ4",
    ultimo_aviso_em: "2026-10-29T17:48:00.000Z", ultima_conferencia_em: "2026-10-29T17:30:00.000Z", ultimo_erro: null,
  },
};
const comStatus = (status: NonNullable<CartaoYampi["conexao"]>["status"]): CartaoYampi => ({ ...ATIVA, conexao: { ...ATIVA.conexao!, status } });

function html(cartao: CartaoYampi, over: Partial<PropsDaYampi> = {}): string {
  return renderToStaticMarkup(
    createElement(PainelDaYampi, { cartao, agora: AGORA, ocupado: null, erroDoFormulario: null, onConectar: noop, onTestar: noop, onDesconectar: noop, ...over }),
  );
}
/** O texto que o leitor de tela lê: sem as tags (o subtítulo do h2 vem num span). */
const texto = (h: string) => h.replace(/<[^>]+>/g, "");
/** A tag do input pelo id. */
function campo(h: string, id: string): string {
  const tag = h.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
  assert.ok(tag, `campo ${id}`);
  return tag;
}

test("sem a chave de cifra: só o recado, nenhum botão", () => {
  const h = html({ disponivel: false, conexao: null });
  assert.match(h, /<h2 id="yampi-titulo"[^>]*>Yampi<\/h2>/);
  assert.match(h, /<section[^>]*aria-labelledby="yampi-titulo"/);
  assert.match(h, /Integração com a Yampi indisponível no momento\./);
  assert.doesNotMatch(h, /<button/);
});

test("não conectada: título, promessa, três campos com rótulo e Conectar Yampi", () => {
  const h = html({ disponivel: true, conexao: null });
  for (const t of ["Yampi · não conectada", "Loja \\(alias na Yampi\\)", "User-Token", "User-Secret-Key", "Conectar Yampi", "Perfil › Credenciais de API", "a conexão cai", "Rastreio do pedido e do Recuperar"]) {
    assert.match(texto(h), new RegExp(t));
  }
  for (const id of ["yampi-alias", "yampi-token", "yampi-chave"]) assert.match(h, new RegExp(`<label[^>]*for="${id}"`));
  // Campo vazio: o botão nasce desligado.
  assert.match(h, /<button type="submit" disabled=""/);
});

test("os campos de segredo: type=password, autocomplete=new-password, fora do vocabulário de credencial e sem preenchimento de gerenciador", () => {
  const h = html({ disponivel: true, conexao: null });
  for (const id of ["yampi-token", "yampi-chave"]) {
    const tag = campo(h, id);
    assert.match(tag, /type="password"/);
    assert.match(tag, /autocomplete="new-password"/i);
    assert.match(tag, /data-1p-ignore/);
    assert.match(tag, /data-lpignore="true"/);
    assert.doesNotMatch(tag, /name="(password|senha|token|user|username)"/i);
  }
  assert.doesNotMatch(campo(h, "yampi-alias"), /type="password"/);
  for (const id of ["yampi-token", "yampi-chave"]) assert.doesNotMatch(campo(h, id), /value=/, id);
});

test("conectada: chip, alias, token só com o final, último aviso e conferência, Testar conexão e Desconectar, e nenhum campo", () => {
  const h = html(ATIVA);
  for (const t of ["Conectada", "Yampi · loja-exemplo", "Token ••••9aZ4", "Último aviso: há 4 min", "Última conferência: há 22 min", "Testar conexão", "Desconectar"]) {
    assert.match(texto(h), new RegExp(t));
  }
  assert.doesNotMatch(h, /<input/);
});

test("ainda sem aviso nem conferência: 'ainda nenhum' e 'ainda não'", () => {
  const h = texto(html({ ...ATIVA, conexao: { ...ATIVA.conexao!, ultimo_aviso_em: null, ultima_conferencia_em: null } }));
  assert.match(h, /Último aviso: ainda nenhum/);
  assert.match(h, /Última conferência: ainda não/);
});

test("aviso desligado: chip âmbar, explicação em role=status e Testar conexão", () => {
  const h = html(comStatus("aviso_desativado"));
  assert.match(h, /text-warning-700[^"]*"><span[^>]*><\/span>Aviso desligado/);
  assert.match(h, /role="status"[^>]*>.*A Yampi parou de avisar a Girumo/);
  assert.match(texto(h), /Testar conexão/);
});

test("acesso recusado: alerta, formulário para colar de novo (Reconectar Yampi) e Desconectar; sem Testar conexão", () => {
  const h = html(comStatus("credencial_invalida"));
  assert.match(texto(h), /Acesso recusado/);
  assert.match(h, /role="alert"[^>]*>.*A Yampi recusou o acesso da Girumo/);
  assert.match(texto(h), /Cole o token e a chave de novo/);
  assert.match(texto(h), /Reconectar Yampi/);
  assert.match(texto(h), /Desconectar/);
  assert.doesNotMatch(texto(h), /Testar conexão/);
  assert.match(campo(h, "yampi-alias"), /value="loja-exemplo"/, "o alias vem preenchido");
  // Não controlado: o React não escreve o segredo no atributo `value` (legível por CSS, extensão ou cópia do HTML).
  for (const id of ["yampi-token", "yampi-chave"]) assert.doesNotMatch(campo(h, id), /value=/, id);
});

test("ocupado: os botões ficam desabilitados e o erro do formulário aparece em role=alert", () => {
  const conectada = html(ATIVA, { ocupado: "testar" });
  const botoes = conectada.match(/<button[^>]*>/g) ?? [];
  assert.ok(botoes.length >= 2 && botoes.every((b) => /disabled/.test(b)));
  const formulario = html({ disponivel: true, conexao: null }, { ocupado: "conectar", erroDoFormulario: "A Yampi recusou essas credenciais." });
  assert.match(formulario, /role="alert"[^>]*>A Yampi recusou essas credenciais\./);
});

test("children só aparecem com conexão", () => {
  const bloco = { children: createElement("p", null, "bloco do módulo") };
  assert.match(html(ATIVA, bloco), /bloco do módulo/);
  assert.match(html(comStatus("credencial_invalida"), bloco), /bloco do módulo/);
  assert.doesNotMatch(html({ disponivel: true, conexao: null }, bloco), /bloco do módulo/);
  assert.doesNotMatch(html({ disponivel: false, conexao: null }, bloco), /bloco do módulo/);
});

test("mensagemDoTeste cobre as cinco combinações com o tom certo", () => {
  assert.deepEqual(mensagemDoTeste({ credenciais: "ok", aviso: "ativo" }), { texto: "Tudo certo: a Yampi respondeu e o aviso está ligado.", tom: "ok" });
  assert.deepEqual(mensagemDoTeste({ credenciais: "ok", aviso: "recriado" }), { texto: "A Yampi respondeu e o aviso estava desligado. Religamos.", tom: "ok" });
  assert.deepEqual(mensagemDoTeste({ credenciais: "ok", aviso: "falhou" }), {
    texto: "A Yampi respondeu, mas não conseguimos religar o aviso. Tentamos de novo daqui a pouco.", tom: "erro",
  });
  assert.deepEqual(mensagemDoTeste({ credenciais: "invalida", aviso: "desconhecido" }), { texto: "A Yampi recusou o acesso. Cole o token e a chave de novo.", tom: "erro" });
  assert.deepEqual(mensagemDoTeste({ credenciais: "erro", aviso: "desconhecido" }), { texto: "A Yampi não respondeu agora. Tente de novo em instantes.", tom: "erro" });
});

test("chipDaYampi: ativa ok, aviso_desativado alerta, credencial_invalida erro", () => {
  assert.deepEqual(chipDaYampi("ativa"), { texto: "Conectada", tom: "ok" });
  assert.deepEqual(chipDaYampi("aviso_desativado"), { texto: "Aviso desligado", tom: "alerta" });
  assert.deepEqual(chipDaYampi("credencial_invalida"), { texto: "Acesso recusado", tom: "erro" });
});
