// apps/web/src/components/painel/link-da-bio/editor.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentoPadrao, type LinkBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import { TelaDoEditor } from "./editor";
import type { EditorBio } from "./use-editor-bio";

const noop = () => {};

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: LinkBio = {
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
const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links: [ZAP] },
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [],
};

function editor(over: Partial<EditorBio> = {}): EditorBio {
  return {
    carga: "ok",
    contexto: CONTEXTO,
    pagina: PAGINA,
    rascunho: estadoDe(PAGINA),
    sujo: false,
    salvando: false,
    criando: false,
    conflito: null,
    aviso: null,
    erro: null,
    rodada: 0,
    carregar: noop,
    criar: noop,
    salvar: noop,
    descartar: noop,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    limparErro: noop,
    ...over,
  };
}

function html(over: Partial<EditorBio> = {}): string {
  return renderToStaticMarkup(createElement(TelaDoEditor, { editor: editor(over), aba: "links", aoEscolherAba: noop, aoCopiar: noop }));
}

test("carregando: esqueleto anunciado, sem endereço nem abas", () => {
  const h = html({ carga: "carregando", pagina: null, rascunho: null, contexto: null });
  assert.match(h, /<h1[^>]*>Link da bio<\/h1>/);
  assert.match(h, /role="status"[^>]*><span class="sr-only">Carregando o link da bio…<\/span>/);
  assert.doesNotMatch(h, /role="tablist"/);
});

test("erro na carga: diz o que não veio e oferece tentar de novo", () => {
  const h = html({ carga: "erro", pagina: null, rascunho: null, contexto: null });
  assert.match(h, /Não deu para carregar o link da bio\./);
  assert.match(h, />Tentar de novo</);
});

test("loja sem página: estado vazio com Criar minha página; criando trava o botão", () => {
  const h = html({ pagina: null, rascunho: null });
  assert.match(h, /<h2 id="bio-vazio-titulo"[^>]*>Monte o link da bio da loja<\/h2>/);
  assert.match(h, /<button type="button"[^>]*>Criar minha página<\/button>/);
  assert.doesNotMatch(h, /role="tablist"/);
  assert.match(html({ pagina: null, rascunho: null, criando: true }), /<button type="button" disabled=""[^>]*>Criando…<\/button>/);
});

test("com página: endereço Girumo com o slug SALVO, Copiar e Abrir, Fora do ar, Salvar desligado sem mudança", () => {
  const h = html({ rascunho: { ...estadoDe(PAGINA), slug: "outro-slug" } });
  assert.match(h, /Link da bio<\/h1><span class="pn-chip">Fora do ar<\/span>/);
  assert.match(h, /https:\/\/www\.girumo\.com\.br\/bio\/loja-exemplo/);
  assert.doesNotMatch(h, /outro-slug/);
  assert.match(h, /aria-label="Copiar o endereço da página"/);
  assert.match(
    h,
    /<a href="https:\/\/www\.girumo\.com\.br\/bio\/loja-exemplo" target="_blank" rel="noopener noreferrer" aria-label="Abrir a página numa aba nova"/,
  );
  assert.match(h, /<button type="button" disabled=""[^>]*>Salvar<\/button>/);
  assert.doesNotMatch(h, /Alterações não salvas/);
});

test("domínio próprio ativo: o endereço principal é a raiz dele", () => {
  const h = html({ contexto: { ...CONTEXTO, dominio: "links.loja.com.br" } });
  assert.match(h, /https:\/\/links\.loja\.com\.br\//);
  assert.match(h, />Domínio próprio</);
});

test("No ar só publicada e sem bloqueio; bloqueada avisa", () => {
  assert.match(html({ pagina: { ...PAGINA, publicada: true } }), /Link da bio<\/h1><span class="pn-chip[^"]*">No ar<\/span>/);
  assert.doesNotMatch(html({ pagina: { ...PAGINA, publicada: true } }), /<h1[^>]*>[^<]*<span/);
  assert.match(html(), /<h1 id="bio-titulo" tabindex="-1"/);
  const bloqueada = html({ pagina: { ...PAGINA, publicada: true, bloqueadaEm: "2026-10-19T12:00:00.000Z" } });
  assert.match(bloqueada, />Fora do ar</);
  assert.match(bloqueada, /A Girumo tirou esta página do ar/);
});

test("alterações não salvas: Descartar e Salvar no cabeçalho e na barra do celular; salvando troca o rótulo", () => {
  const h = html({ sujo: true });
  assert.equal(h.match(/Alterações não salvas/g)?.length, 2);
  assert.match(h, /role="region" aria-label="Salvar alterações" class="pn-bio-salvar /);
  assert.equal(h.match(/>Descartar</g)?.length, 2);
  assert.doesNotMatch(h, /disabled=""[^>]*>Salvar</);
  assert.equal(html({ sujo: true, salvando: true }).match(/>Salvando…</g)?.length, 2);
});

test("409 vira aviso com Recarregar; falha e erro de campo sem aba dona viram aviso; erro de link fica com a aba", () => {
  assert.match(
    html({ conflito: "Outra pessoa salvou antes. Recarregue pra ver a versão nova." }),
    /role="alert"[^>]*>[\s\S]*Outra pessoa salvou antes\. Recarregue pra ver a versão nova\.[\s\S]*>Recarregar</,
  );
  assert.match(html({ aviso: "Sem permissão para esta ação." }), /role="alert"[^>]*>Sem permissão para esta ação\.</);
  assert.match(
    html({ erro: { campo: "slug", mensagem: "Esse endereço já é de outra loja." } }),
    /role="alert"[^>]*>Esse endereço já é de outra loja\.</,
  );
  assert.doesNotMatch(html({ erro: { campo: "links.0.numero", mensagem: "Número conectado." } }), /Número conectado\./);
});

test("abas: Links selecionada, com o painel ligado a ela", () => {
  const h = html();
  assert.match(h, /role="tablist" aria-label="Partes da página"/);
  assert.match(h, /role="tabpanel" id="bio-painel-links" aria-labelledby="bio-aba-links"/);
  assert.match(h, /<section aria-label="Editar a página"/);
});
