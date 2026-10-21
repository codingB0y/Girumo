// apps/web/src/lib/bio/editor-links.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";

import {
  alternarLink,
  anuncioDaOrdem,
  ATALHOS,
  avisoDoLink,
  comLink,
  contagemDosLinks,
  erroNoLink,
  errosDoLink,
  linkDoAtalho,
  mesmoConteudo,
  moverLink,
  primeiroCampoComErro,
  rascunhoDoLink,
  resumoDoLink,
  semLink,
  validarLink,
  type ContextoDosAvisos,
  type ErrosDoLink,
} from "./editor";

type Tipo<T extends LinkBio["tipo"]> = Extract<LinkBio, { tipo: T }>;

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Tipo<"whatsapp"> = {
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
const GRUPO: Tipo<"grupo"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const SITE: Tipo<"link"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b03",
  tipo: "link",
  titulo: "Catálogo",
  sub: "Kits e preços",
  icone: "catalogo",
  ativo: false,
  destaque: false,
  url: "https://loja.exemplo.com.br/catalogo",
  fotos: [],
};
const LOJA: Tipo<"endereco"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b04",
  tipo: "endereco",
  titulo: "Como chegar",
  sub: "",
  icone: "mapa",
  ativo: true,
  endereco: "Rua Exemplo, 100\nCentro, Goiânia",
  horario: "Seg a sáb, 8h às 18h",
  foto: null,
};
const CAMPANHAS: CampanhaDoPainel[] = [
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" },
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02", nome: "Saldão", slug: null },
];
const SALVOS: LinkBio[] = [ZAP, GRUPO, SITE, LOJA];
const CTX: ContextoDosAvisos = { campanhas: CAMPANHAS, linksEscondidos: [], salvos: SALVOS };
const APAGADA = "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d99";

function valido(link: LinkBio): LinkBio {
  const r = validarLink(link);
  assert.ok(r.ok, JSON.stringify(r));
  return r.link;
}

function erros(link: LinkBio): ErrosDoLink {
  const r = validarLink(link);
  assert.equal(r.ok, false);
  return r.ok ? {} : r.erros;
}

test("os seis atalhos preenchem tipo, ícone e textos; o Grupo VIP nasce na primeira campanha com link", () => {
  assert.deepEqual(
    ATALHOS.map((a) => a.nome),
    ["WhatsApp da loja", "Grupo VIP", "Catálogo ou site", "Como chegar", "Canal do WhatsApp", "Outro link"],
  );
  const id = "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b09";
  const feitos = ATALHOS.map((a) => linkDoAtalho(a.id, { id, campanhas: CAMPANHAS }));
  assert.deepEqual(
    feitos.map((l) => [l.tipo, l.icone, l.titulo]),
    [
      ["whatsapp", "whatsapp", "Falar com a vendedora"],
      ["grupo", "coroa", "Entrar no grupo VIP"],
      ["link", "catalogo", "Catálogo"],
      ["endereco", "mapa", "Como chegar na loja"],
      ["link", "canal", "Seguir o canal da loja"],
      ["link", "link", ""],
    ],
  );
  assert.ok(feitos.every((l) => l.id === id && l.ativo));
  const grupo = feitos[1];
  assert.equal(grupo.tipo === "grupo" && grupo.campanhaId, CAMPANHAS[0].id);
  // Só campanha sem link: nasce nela (o aviso da lista explica); nenhuma: vazio, e o Adicionar pede a campanha.
  const soSemLink = linkDoAtalho("grupo", { id, campanhas: [CAMPANHAS[1]] });
  assert.equal(soSemLink.tipo === "grupo" && soSemLink.campanhaId, CAMPANHAS[1].id);
  const nenhuma = linkDoAtalho("grupo", { id, campanhas: [] });
  assert.equal(nenhuma.tipo === "grupo" && nenhuma.campanhaId, "");
});

test("validarLink normaliza como o servidor: endereço sem esquema ganha https://, número formatado vira 55+dígitos, texto aparado", () => {
  const site = valido({ ...SITE, titulo: "  Catálogo  ", url: "loja.exemplo.com.br/catalogo" });
  assert.equal(site.titulo, "Catálogo");
  assert.equal(site.tipo === "link" && site.url, "https://loja.exemplo.com.br/catalogo");
  const zap = valido({ ...ZAP, numero: "(62) 99999-0000" });
  assert.equal(zap.tipo === "whatsapp" && zap.numero, "5562999990000");
  assert.equal(valido(LOJA).tipo, "endereco");
});

test("validarLink recusa com a frase do campo: título vazio, número curto, javascript:, sem ponto, endereço curto, campanha vazia", () => {
  assert.deepEqual(erros({ ...ZAP, titulo: "   " }), { titulo: "Escreva o texto do botão." });
  assert.equal(erros({ ...ZAP, numero: "1234" }).numero, "Número com DDD. Ex.: 62 99999-9999.");
  assert.equal(erros({ ...SITE, url: "javascript:alert(1)" }).url, "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo");
  assert.equal(erros({ ...SITE, url: "sem-ponto" }).url, "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo");
  assert.equal(erros({ ...LOJA, endereco: "Rua" }).endereco, "Escreva o endereço da loja, com pelo menos 5 letras.");
  assert.equal(erros({ ...GRUPO, campanhaId: "" }).campanhaId, "Escolha a campanha.");
});

test("editar um link e aplicar sem mudar nada não suja a página: a volta do número formatado dá o mesmo valor", () => {
  const salvo: DocumentoBio = { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links: [ZAP, SITE] };
  const reaplicado = { ...salvo, links: comLink(salvo.links, valido(rascunhoDoLink(ZAP))) };
  assert.equal(mesmoConteudo(reaplicado, salvo), true);
  assert.equal(mesmoConteudo({ ...salvo, links: alternarLink(salvo.links, ZAP.id) }, salvo), false);
});

test("rascunho da folha: o número volta formatado, o resto igual", () => {
  assert.equal((rascunhoDoLink(ZAP) as Tipo<"whatsapp">).numero, "+55 62 99999-0000");
  assert.equal(rascunhoDoLink(SITE), SITE);
});

test("erro do servidor num link vira a folha daquele link com o erro no campo; fora de link, null", () => {
  assert.deepEqual(erroNoLink({ campo: "links.2.numero", mensagem: "Número conectado." }), {
    indice: 2,
    erros: { numero: "Número conectado." },
  });
  assert.deepEqual(erroNoLink({ campo: "links.1.fotos.0", mensagem: "Foto de outra loja." }), {
    indice: 1,
    erros: { geral: "Foto de outra loja." },
  });
  assert.deepEqual(erroNoLink({ campo: "links.0", mensagem: "Tipo inválido." }), { indice: 0, erros: { geral: "Tipo inválido." } });
  assert.equal(erroNoLink({ campo: "links", mensagem: "Máximo de 20." }), null);
  assert.equal(erroNoLink({ campo: "perfil.nome", mensagem: "x" }), null);
  assert.equal(erroNoLink({ campo: "links.x.titulo", mensagem: "x" }), null);
});

test("erros do zod por campo, só do link pedido; o primeiro campo com erro segue a ordem da folha", () => {
  const issues = [
    { path: ["links", 1, "url"] },
    { path: ["links", 0, "titulo"] },
    { path: ["links", 0, "titulo"] },
    { path: ["links", 0, "fotos", 0] },
    { path: ["perfil", "nome"] },
  ];
  assert.deepEqual(errosDoLink(issues, 0), { titulo: "Escreva o texto do botão.", geral: "Confira os dados deste link." });
  assert.deepEqual(errosDoLink(issues, 1), { url: "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo" });
  assert.equal(primeiroCampoComErro({ url: "x", titulo: "y" }), "titulo");
  assert.equal(primeiroCampoComErro({ horario: "x", numero: "y" }), "numero");
  assert.equal(primeiroCampoComErro({ geral: "x" }), null);
});

test("resumo de cada tipo na segunda linha da lista", () => {
  assert.equal(resumoDoLink(ZAP, CAMPANHAS), "WhatsApp · +55 62 99999-0000");
  assert.equal(resumoDoLink({ ...ZAP, numero: "" }, CAMPANHAS), "WhatsApp · sem número");
  assert.equal(resumoDoLink(GRUPO, CAMPANHAS), "Grupo VIP · VIP Atacado");
  assert.equal(resumoDoLink({ ...GRUPO, campanhaId: APAGADA }, CAMPANHAS), "Grupo VIP · campanha apagada");
  assert.equal(resumoDoLink(SITE, CAMPANHAS), "loja.exemplo.com.br/catalogo");
  assert.equal(resumoDoLink({ ...SITE, url: "https://loja.exemplo.com.br/" }, CAMPANHAS), "loja.exemplo.com.br");
  assert.equal(resumoDoLink(LOJA, CAMPANHAS), "Rua Exemplo, 100");
});

test("aviso vermelho: campanha apagada ou sem link; número que a API escondeu, até ser trocado no rascunho", () => {
  assert.equal(avisoDoLink(GRUPO, CTX), null);
  assert.equal(
    avisoDoLink({ ...GRUPO, campanhaId: CAMPANHAS[1].id }, CTX),
    "Essa campanha não tem link pra entrar no grupo. Escolha outra campanha.",
  );
  assert.equal(avisoDoLink({ ...GRUPO, campanhaId: APAGADA }, CTX), "A campanha deste botão foi apagada. Escolha outra campanha.");
  const escondido: ContextoDosAvisos = { ...CTX, linksEscondidos: [ZAP.id, SITE.id, LOJA.id] };
  assert.match(avisoDoLink(ZAP, escondido) ?? "", /^Este é o número conectado na Girumo/);
  assert.match(avisoDoLink(SITE, escondido) ?? "", /^Este endereço leva pro número conectado/);
  // Trocou o número no rascunho: o aviso sai até o salvar conferir de novo.
  assert.equal(avisoDoLink({ ...ZAP, numero: "5562988887777" }, escondido), null);
  assert.equal(avisoDoLink(ZAP, CTX), null);
  assert.equal(avisoDoLink(LOJA, escondido), null);
  // Link que só existe no rascunho não herda aviso.
  const novoId = "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b07";
  assert.equal(avisoDoLink({ ...ZAP, id: novoId }, { ...escondido, linksEscondidos: [novoId] }), null);
});

test("contagem: aparecendo = ligado e sem aviso", () => {
  assert.equal(contagemDosLinks(SALVOS, CTX), "4 links · 3 aparecendo na página");
  assert.equal(contagemDosLinks(SALVOS, { ...CTX, linksEscondidos: [ZAP.id] }), "4 links · 2 aparecendo na página");
  assert.equal(contagemDosLinks([LOJA], CTX), "1 link · 1 aparecendo na página");
  assert.equal(contagemDosLinks([], CTX), "0 links · 0 aparecendo na página");
});

test("pôr, tirar, ligar e mover links sem mexer na lista original; destaque é um só", () => {
  const original = [...SALVOS];
  const novo: Tipo<"link"> = { ...SITE, id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b05", ativo: true, destaque: true };
  const com = comLink(SALVOS, novo);
  assert.deepEqual(com.map((l) => l.id), [...SALVOS.map((l) => l.id), novo.id]);
  assert.deepEqual(com.filter((l) => l.tipo !== "endereco" && l.destaque).map((l) => l.id), [novo.id]);
  const trocado = comLink(SALVOS, { ...GRUPO, titulo: "VIP" });
  assert.deepEqual(trocado.map((l) => l.titulo), ["Falar com a vendedora", "VIP", "Catálogo", "Como chegar"]);
  assert.equal((trocado[0] as Tipo<"whatsapp">).destaque, true);
  assert.deepEqual(semLink(SALVOS, GRUPO.id).map((l) => l.id), [ZAP.id, SITE.id, LOJA.id]);
  assert.equal(alternarLink(SALVOS, SITE.id)[2].ativo, true);
  assert.deepEqual(moverLink(SALVOS, SITE.id, -1).map((l) => l.id), [ZAP.id, SITE.id, GRUPO.id, LOJA.id]);
  assert.deepEqual(moverLink(SALVOS, SITE.id, 1).map((l) => l.id), [ZAP.id, GRUPO.id, LOJA.id, SITE.id]);
  assert.deepEqual(moverLink(SALVOS, ZAP.id, -1).map((l) => l.id), original.map((l) => l.id));
  assert.deepEqual(moverLink(SALVOS, LOJA.id, 1).map((l) => l.id), original.map((l) => l.id));
  assert.deepEqual(SALVOS, original);
  assert.equal(anuncioDaOrdem("Catálogo", 2, 4), "Catálogo: agora é o 2º de 4.");
});
