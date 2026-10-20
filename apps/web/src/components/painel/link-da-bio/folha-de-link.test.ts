// apps/web/src/components/painel/link-da-bio/folha-de-link.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LinkBio } from "@/lib/bio/documento";
import { linkDoAtalho } from "@/lib/bio/editor";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";

import { ConteudoDaFolha, type PropsDoConteudoDaFolha } from "./folha-de-link";

const noop = () => {};
const ID = "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b09";
const CAMPANHAS: CampanhaDoPainel[] = [
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" },
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02", nome: "Saldão", slug: null },
];
const SITE: LinkBio = {
  id: ID,
  tipo: "link",
  titulo: "Catálogo",
  sub: "",
  icone: "catalogo",
  ativo: true,
  destaque: false,
  url: "https://loja.exemplo.com.br/catalogo",
  fotos: [],
};

function html(over: Partial<PropsDoConteudoDaFolha>): string {
  const props: PropsDoConteudoDaFolha = {
    rascunho: null,
    novo: true,
    erros: {},
    confirmando: false,
    campanhas: CAMPANHAS,
    aoEscolher: noop,
    aoVoltar: noop,
    aoMudar: noop,
    aoIcone: noop,
    aoDestaque: noop,
    aoAplicar: noop,
    aoCancelar: noop,
    aoPedirExclusao: noop,
    aoCancelarExclusao: noop,
    aoExcluir: noop,
    ...over,
  };
  return renderToStaticMarkup(createElement(ConteudoDaFolha, props));
}

test("Adicionar link: os seis atalhos, cada um com nome, descrição e id de foco", () => {
  const h = html({});
  for (const id of ["whatsapp", "grupo", "catalogo", "endereco", "canal", "outro"]) {
    assert.match(h, new RegExp(`id="bio-atalho-${id}"`));
  }
  assert.match(h, /<ul aria-label="Tipos de link"/);
  assert.match(h, />WhatsApp da loja</);
  assert.match(h, />Entra no grupo da campanha que estiver com vaga</);
  assert.match(h, />Outro link</);
  assert.doesNotMatch(h, /<form/);
});

test("novo WhatsApp: campos com rótulo, aviso do número conectado ligado ao campo, destaque e Adicionar", () => {
  const h = html({ rascunho: linkDoAtalho("whatsapp", { id: ID, campanhas: CAMPANHAS }) });
  assert.match(h, /<label for="bio-link-titulo"[^>]*>Texto do botão<\/label>/);
  assert.match(h, /<input[^>]*id="bio-link-titulo"[^>]*value="Falar com a vendedora"/);
  assert.match(h, /<label for="bio-link-numero"[^>]*>WhatsApp de atendimento, com DDD<\/label>/);
  assert.match(h, /<input[^>]*type="tel"[^>]*id="bio-link-numero"[^>]*aria-describedby="bio-link-numero-aviso"/);
  assert.match(h, /id="bio-link-numero-aviso"[^>]*>[\s\S]*Não use o número conectado na Girumo: é ele que posta nos grupos\./);
  assert.match(h, />Mensagem que já vai escrita</);
  assert.match(h, /role="switch" aria-checked="false" aria-label="Botão em destaque"/);
  assert.match(h, /aria-label="Voltar pros tipos de link"/);
  assert.match(h, /<button type="submit"[^>]*>Adicionar<\/button>/);
  assert.doesNotMatch(h, />Excluir</);
});

test("editar link: endereço, ícones com o atual marcado, Pronto e Excluir", () => {
  const h = html({ rascunho: SITE, novo: false });
  assert.match(h, /id="bio-link-url"[^>]*value="https:\/\/loja\.exemplo\.com\.br\/catalogo"/);
  assert.match(h, /inputMode="url"/);
  assert.match(h, /role="group" aria-labelledby="bio-link-icone"/);
  assert.match(h, /aria-pressed="true" aria-label="Catálogo"/);
  assert.match(h, /aria-pressed="false" aria-label="Instagram"/);
  assert.match(h, /<button type="submit"[^>]*>Pronto<\/button>/);
  assert.match(h, /<button type="button" id="bio-link-excluir"[^>]*>[\s\S]*Excluir<\/button>/);
  assert.doesNotMatch(h, /Voltar pros tipos de link/);
});

test("erro embaixo do campo, ligado por aria-describedby, com aria-invalid; erro geral anunciado", () => {
  const h = html({
    rascunho: SITE,
    novo: false,
    erros: { url: "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo", geral: "Foto de outra loja." },
  });
  assert.match(h, /id="bio-link-url"[^>]*aria-invalid="true"[^>]*aria-describedby="bio-link-url-erro"/);
  assert.match(h, /<p id="bio-link-url-erro"[^>]*>Esse endereço não parece um link\. Ex\.: sualoja\.com\.br\/catalogo<\/p>/);
  assert.match(h, /<p role="alert"[^>]*>Foto de outra loja\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-link-titulo"[^>]*aria-invalid="/);
});

test("grupo: campanhas da loja, a sem link avisa no nome, a atual marcada; sem campanha diz o que fazer", () => {
  const h = html({ rascunho: linkDoAtalho("grupo", { id: ID, campanhas: CAMPANHAS }) });
  assert.match(h, /<label for="bio-link-campanhaId"[^>]*>Campanha<\/label>/);
  assert.match(h, /<option value="">Escolha a campanha…<\/option>/);
  assert.match(h, /<option value="0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01" selected="">VIP Atacado<\/option>/);
  assert.match(h, /<option value="0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02">Saldão \(sem link\)<\/option>/);
  assert.match(h, /O botão usa o link da campanha: quem toca entra no grupo que estiver com vaga\./);
  const vazio = html({ rascunho: linkDoAtalho("grupo", { id: ID, campanhas: [] }), campanhas: [] });
  assert.match(vazio, /Você ainda não tem campanha\. Crie uma em Campanhas e volte aqui\./);
  assert.match(vazio, /<option value="" selected="">Escolha a campanha…<\/option>/);
});

test("Como chegar: endereço em várias linhas e horário; sem destaque (não vale pro endereço)", () => {
  const h = html({ rascunho: linkDoAtalho("endereco", { id: ID, campanhas: [] }) });
  assert.match(h, /<textarea[^>]*id="bio-link-endereco"/);
  assert.match(h, /<label for="bio-link-horario"[^>]*>Horário \(opcional\)<\/label>/);
  assert.doesNotMatch(h, /Botão em destaque/);
});

test("confirmar exclusão: pergunta pelo título na própria folha, com Não e Excluir", () => {
  const h = html({ rascunho: SITE, novo: false, confirmando: true });
  assert.match(h, /Excluir “Catálogo” da página\?/);
  assert.match(h, /<button type="button"[^>]*>Não<\/button>/);
  assert.match(h, /<p id="bio-link-excluir-pergunta"/);
  assert.match(h, /<button type="button"[^>]*aria-describedby="bio-link-excluir-pergunta"[^>]*>Não<\/button>/);
  assert.doesNotMatch(h, />Cancelar</);
  assert.doesNotMatch(h, /id="bio-link-excluir"/);
});

test("Outro link: placeholder do site; Canal do WhatsApp: placeholder do canal", () => {
  assert.match(html({ rascunho: linkDoAtalho("outro", { id: ID, campanhas: [] }) }), /placeholder="sualoja\.com\.br\/catalogo"/);
  assert.match(html({ rascunho: linkDoAtalho("canal", { id: ID, campanhas: [] }) }), /placeholder="whatsapp\.com\/channel\/…"/);
});
