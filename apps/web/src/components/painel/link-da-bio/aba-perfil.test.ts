// apps/web/src/components/painel/link-da-bio/aba-perfil.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DocumentoBio } from "@/lib/bio/documento";
import { estadoDe, type ContextoDoEditor, type ErroDeCampo } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { documentoFalso, IDS } from "@/test/bio-dados-falsos";

import { AbaPerfil } from "./aba-perfil";
import { ABAS, abaDoErro, type PropsDaAba } from "./abas";

const noop = () => {};
// A loja fictícia do PR 3a: nada da loja-piloto (repo público).
const DOC = documentoFalso();
const PAGINA: PaginaBio = {
  id: IDS.pagina,
  tenantId: "tenant-exemplo",
  slug: "atelie-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: [],
  dominio: null,
  origemGirumo: "https://www.girumo.com.br",
  sugestaoSlug: "atelie-exemplo",
  linksEscondidos: [],
};

function html(documento: DocumentoBio = DOC, erro: ErroDeCampo | null = null): string {
  const props: PropsDaAba = {
    pagina: PAGINA,
    rascunho: { ...estadoDe(PAGINA), documento },
    contexto: CONTEXTO,
    mudarDocumento: noop,
    mudarPagina: noop,
    reverAnimacao: noop,
    erro,
    limparErro: noop,
  };
  return renderToStaticMarkup(createElement(AbaPerfil, props));
}

test("Foto e logo: a capa com Trocar, Remover e Ajustar o foco fechado; a descrição; as duas logos", () => {
  const h = html();
  assert.match(h, /<h2 id="bio-fotos-titulo"[^>]*>Foto e logo<\/h2>/);
  assert.match(h, /aria-label="Trocar foto da loja"/);
  assert.match(h, /aria-label="Remover foto da loja"/);
  assert.match(
    h,
    /<button type="button" id="bio-perfil-ajustar-foco" aria-expanded="false" aria-controls="bio-perfil-foco"[^>]*>[\s\S]*Ajustar o foco<\/button>/,
  );
  assert.doesNotMatch(h, /role="application"/);
  assert.match(h, /<input type="text" id="bio-perfil-capaAlt"[^>]*value="Fachada da loja de exemplo"/);
  assert.match(h, /aria-label="Trocar logo clara"/);
  assert.match(h, /aria-label="Trocar logo escura"/);
  const semCapa = html({ ...DOC, perfil: { ...DOC.perfil, capa: null } });
  assert.match(semCapa, /aria-label="Escolher foto da loja"/);
  assert.doesNotMatch(semCapa, /Ajustar o foco/);
});

test("Nome e textos: nome, frase com contador, 3 destaques num grupo nomeado, onde fica e o @ fora do valor", () => {
  const h = html();
  assert.match(h, /<label for="bio-perfil-nome"[^>]*>Nome da loja<\/label>/);
  assert.match(h, /id="bio-perfil-nome"[^>]*value="Ateliê Exemplo Kids"/);
  assert.match(h, new RegExp(`id="bio-perfil-frase-conta"[^>]*>${DOC.perfil.frase.length}/120<`));
  assert.match(h, /<div role="group" id="bio-perfil-destaques" tabindex="-1" aria-labelledby="bio-perfil-destaques-rotulo"/);
  assert.match(h, /id="bio-perfil-destaques-0" aria-label="Destaque 1"[^>]*value="a partir de R\$ 19,90 a peça"/);
  assert.match(h, /id="bio-perfil-destaques-2" aria-label="Destaque 3"[^>]*value="envio pro Brasil inteiro"/);
  assert.match(h, /id="bio-perfil-local"[^>]*value="Loja na Rua Exemplo, 100, Centro, Cidade Exemplo"/);
  assert.match(h, />@<\/span><input type="text"[^>]*id="bio-perfil-instagram"[^>]*maxLength="100"[^>]*value="atelie\.exemplo"/);
  // Um destaque só: os outros campos ficam vazios, prontos pra digitar.
  const um = html({ ...DOC, perfil: { ...DOC.perfil, destaques: ["12 kits no catálogo"] } });
  assert.match(um, /id="bio-perfil-destaques-1" aria-label="Destaque 2"[^>]*value=""/);
});

test("CNPJ com máscara na tela; completo e errado avisa na hora; pela metade não", () => {
  const h = html();
  assert.match(h, /role="switch" aria-checked="true" aria-label="Mostrar o bloco Antes de pagar, confere"/);
  assert.match(h, /id="bio-confere-razao"[^>]*value="Ateliê Exemplo Comércio de Roupas Ltda"/);
  assert.match(h, /id="bio-confere-cnpj"[^>]*value="11\.222\.333\/0001-81"/);
  assert.match(h, /id="bio-confere-linhas-1" aria-label="Aviso 2"/);
  assert.doesNotMatch(h, /Confira o CNPJ/);
  const errado = html({ ...DOC, confere: { ...DOC.confere, cnpj: "11222333000180" } });
  assert.match(errado, /id="bio-confere-cnpj"[^>]*aria-invalid="true" aria-describedby="bio-confere-cnpj-erro bio-confere-cnpj-ajuda"/);
  assert.match(errado, /<p id="bio-confere-cnpj-erro"[^>]*>Confira o CNPJ: os números não batem\.<\/p>/);
  const metade = html({ ...DOC, confere: { ...DOC.confere, cnpj: "1122233" } });
  assert.match(metade, /id="bio-confere-cnpj"[^>]*value="11\.222\.33"/);
  assert.doesNotMatch(metade, /Confira o CNPJ/);
});

test("erro do salvar no CNPJ com o bloco desligado: a frase embaixo do campo, que continua na tela", () => {
  const desligado: DocumentoBio = { ...DOC, confere: { ...DOC.confere, ativo: false } };
  const h = html(desligado, { campo: "confere.cnpj", mensagem: "Esse CNPJ não fecha." });
  assert.match(h, /role="switch" aria-checked="false" aria-label="Mostrar o bloco Antes de pagar, confere"/);
  assert.match(h, /id="bio-confere-cnpj"[^>]*aria-invalid="true"/);
  assert.match(h, /<p id="bio-confere-cnpj-erro"[^>]*>Esse CNPJ não fecha\.<\/p>/);
  assert.doesNotMatch(h, /id="bio-aba-aviso"/);
});

test("erro do salvar: o do nome embaixo do nome; o de um destaque embaixo do grupo; o sem lugar no aviso do topo", () => {
  const nome = html(DOC, { campo: "perfil.nome", mensagem: "Escreva o nome da loja." });
  assert.match(nome, /id="bio-perfil-nome"[^>]*aria-invalid="true" aria-describedby="bio-perfil-nome-erro"/);
  assert.match(nome, /<p id="bio-perfil-nome-erro"[^>]*>Escreva o nome da loja\.<\/p>/);
  const destaque = html(DOC, { campo: "perfil.destaques.1", mensagem: "Cada destaque vai até 40 letras." });
  assert.match(destaque, /aria-describedby="bio-perfil-destaques-erro"/);
  assert.match(destaque, /<p id="bio-perfil-destaques-erro"[^>]*>Cada destaque vai até 40 letras\.<\/p>/);
  const solto = html(DOC, { campo: "perfil", mensagem: "Confira o perfil." });
  assert.match(solto, /<p id="bio-aba-aviso" role="alert" tabindex="-1"[^>]*>Confira o perfil\.<\/p>/);
});

test("selo e Romaneio: interruptor do Feito com Girumo; o Romaneio avisa que não usa a foto", () => {
  assert.match(html(), /role="switch" aria-checked="true" aria-label="Mostrar “Feito com Girumo” no rodapé"/);
  assert.doesNotMatch(html(), /não usa a foto/);
  assert.match(html({ ...DOC, modelo: "romaneio", paleta: "kraft" }), /O modelo Romaneio não usa a foto/);
});

test("registro: Perfil depois de Links; os erros de perfil, confere e selo vão pra ela", () => {
  const ids = ABAS.map((a) => a.id);
  assert.ok(ids.indexOf("perfil") > ids.indexOf("links"), String(ids));
  assert.equal(abaDoErro({ campo: "perfil.destaques.2", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "confere.cnpj", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "feitoComGirumo", mensagem: "x" })?.id, "perfil");
  assert.equal(abaDoErro({ campo: "perfilado", mensagem: "x" }), undefined);
});
