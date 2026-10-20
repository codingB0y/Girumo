// apps/web/src/lib/bio/editor.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { RespostaDoPainelBio } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import {
  contextoDe,
  ehPaginaBio,
  ehRespostaDoPainelBio,
  enderecoPrincipal,
  erroDoDocumento,
  estadoDe,
  mensagemDoCampo,
  mesmoConteudo,
  padraoDoCampo,
  resultadoDoSalvar,
} from "./editor";

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Extract<LinkBio, { tipo: "whatsapp" }> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "Pedido no WhatsApp",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "Oi! Vim pelo Instagram. (BIO)",
};

function documento(links: LinkBio[]): DocumentoBio {
  return { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links };
}

const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: documento([ZAP]),
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};

const RESPOSTA: RespostaDoPainelBio = {
  pagina: PAGINA,
  campanhas: [{ id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" }],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [],
};

test("guarda do GET: aceita com e sem página; recusa erro, campo faltando e tipo errado", () => {
  assert.equal(ehRespostaDoPainelBio(RESPOSTA), true);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, pagina: null, dominio: "links.loja.com.br" }), true);
  assert.equal(ehRespostaDoPainelBio({ error: "Não autorizado." }), false);
  assert.equal(ehRespostaDoPainelBio(null), false);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, campanhas: [{ id: "x", nome: "Sem slug" }] }), false);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, linksEscondidos: [1] }), false);
  assert.equal(ehRespostaDoPainelBio({ ...RESPOSTA, pagina: { ...PAGINA, versao: "3" } }), false);
  assert.equal(ehPaginaBio({ ...PAGINA, documento: {} }), false);
});

test("estado salvável e contexto saem do GET", () => {
  assert.deepEqual(estadoDe(PAGINA), { slug: "loja-exemplo", publicada: false, documento: PAGINA.documento });
  assert.deepEqual(contextoDe(RESPOSTA), {
    campanhas: RESPOSTA.campanhas,
    dominio: null,
    origemGirumo: "https://www.girumo.com.br",
    sugestaoSlug: "loja-exemplo",
    linksEscondidos: [],
  });
});

test("mesmo conteúdo ignora a ordem das chaves (o jsonb reordena), mas não a dos links nem um valor", () => {
  assert.equal(mesmoConteudo({ a: 1, b: { c: 2, d: [1, 2] } }, { b: { d: [1, 2], c: 2 }, a: 1 }), true);
  assert.equal(mesmoConteudo({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(mesmoConteudo({ a: 1 }, { a: 2 }), false);
  const doBanco = Object.fromEntries(Object.entries(ZAP).reverse()) as LinkBio;
  assert.equal(mesmoConteudo(estadoDe(PAGINA), { ...estadoDe(PAGINA), documento: documento([doBanco]) }), true);
});

test("endereço principal: raiz do domínio próprio; senão a origem Girumo com /bio/<slug salvo>", () => {
  assert.equal(
    enderecoPrincipal({ dominio: "links.loja.com.br", origemGirumo: "https://www.girumo.com.br" }, "loja-exemplo"),
    "https://links.loja.com.br/",
  );
  assert.equal(
    enderecoPrincipal({ dominio: null, origemGirumo: "https://www.girumo.com.br" }, "loja-exemplo"),
    "https://www.girumo.com.br/bio/loja-exemplo",
  );
  assert.equal(
    enderecoPrincipal({ dominio: null, origemGirumo: "https://www.girumo.com.br/" }, "loja-exemplo"),
    "https://www.girumo.com.br/bio/loja-exemplo",
  );
});

test("mensagem do campo pelo caminho do zod, com os índices trocados", () => {
  assert.equal(padraoDoCampo("links.12.numero"), "links.*.numero");
  assert.equal(padraoDoCampo("perfil.destaques.1"), "perfil.destaques.*");
  assert.equal(mensagemDoCampo("links.3.numero"), "Número com DDD. Ex.: 62 99999-9999.");
  assert.equal(mensagemDoCampo("links.0.titulo"), "Escreva o texto do botão.");
  assert.equal(mensagemDoCampo("qualquer.coisa"), "Confira este campo.");
});

test("antes do PATCH, o documento passa pelo mesmo documentoBio; o primeiro erro vem com o caminho do campo", () => {
  assert.equal(erroDoDocumento(PAGINA.documento), null);
  assert.deepEqual(erroDoDocumento(documento([{ ...ZAP, titulo: "" }])), {
    campo: "links.0.titulo",
    mensagem: "Escreva o texto do botão.",
  });
});

test("PATCH: 200 grava; 409 de versão e 404 viram aviso com Recarregar; 409 de slug e 400 com campo vão pro campo", () => {
  assert.deepEqual(resultadoDoSalvar(200, PAGINA, ""), { tipo: "ok", pagina: PAGINA });
  assert.deepEqual(resultadoDoSalvar(409, { error: "Versão velha.", motivo: "versao" }, ""), {
    tipo: "conflito",
    mensagem: "Outra pessoa salvou antes. Recarregue pra ver a versão nova.",
  });
  assert.deepEqual(resultadoDoSalvar(404, { error: "Loja sem página." }, ""), {
    tipo: "conflito",
    mensagem: "Essa página não existe mais. Recarregue pra ver como ela está agora.",
  });
  assert.deepEqual(resultadoDoSalvar(409, { error: "Esse endereço já é de outra loja.", motivo: "slug" }, ""), {
    tipo: "campo",
    erro: { campo: "slug", mensagem: "Esse endereço já é de outra loja." },
  });
  const conectado = "Esse é o número que a Girumo usa para postar nos grupos. Use o número de atendimento.";
  assert.deepEqual(resultadoDoSalvar(400, { error: conectado, campo: "links.2.numero" }, ""), {
    tipo: "campo",
    erro: { campo: "links.2.numero", mensagem: conectado },
  });
  assert.deepEqual(resultadoDoSalvar(400, { campo: "links.0.url" }, ""), {
    tipo: "campo",
    erro: { campo: "links.0.url", mensagem: "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo" },
  });
});

test("PATCH sem campo: a frase da rota, o texto puro do 403; nunca HTML nem corpo estranho na tela", () => {
  const padrao = "Não deu pra salvar. Confira a internet e tente de novo.";
  assert.deepEqual(resultadoDoSalvar(400, { error: "Documento inválido." }, ""), { tipo: "falha", mensagem: "Documento inválido." });
  assert.deepEqual(resultadoDoSalvar(403, null, "Sem permissão para esta ação."), {
    tipo: "falha",
    mensagem: "Sem permissão para esta ação.",
  });
  assert.deepEqual(resultadoDoSalvar(401, null, "<!doctype html><title>x</title>"), { tipo: "falha", mensagem: padrao });
  assert.deepEqual(resultadoDoSalvar(502, null, "Bad gateway"), { tipo: "falha", mensagem: padrao });
  assert.deepEqual(resultadoDoSalvar(200, { ok: true }, ""), { tipo: "falha", mensagem: padrao });
});

test("erro de superRefine (custom) traz a frase do schema: dois links em destaque", () => {
  const dois = documento([ZAP, { ...ZAP, id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02" }]);
  assert.deepEqual(erroDoDocumento(dois), { campo: "links.1.destaque", mensagem: "Só um link pode ser o principal." });
});
