// apps/web/src/lib/bio/editor-previa.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

import {
  dadosDaPrevia,
  destinoInterno,
  escondidosNaTela,
  NOME_DO_MODELO,
  type CliqueLido,
  type ContextoDoEditor,
} from "./editor";

type Tipo<T extends LinkBio["tipo"]> = Extract<LinkBio, { tipo: T }>;

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: Tipo<"whatsapp"> = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b01",
  tipo: "whatsapp",
  titulo: "Falar com a vendedora",
  sub: "",
  icone: "whatsapp",
  ativo: true,
  destaque: true,
  numero: "5562999990000",
  mensagem: "",
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
const GRUPO_SEM_LINK: Tipo<"grupo"> = { ...GRUPO, id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b05", campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02" };
const CAMPANHAS: CampanhaDoPainel[] = [
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01", nome: "VIP Atacado", slug: "vip-atacado" },
  { id: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d02", nome: "Saldão", slug: null },
];

function documento(links: LinkBio[]): DocumentoBio {
  return { ...documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }), links };
}

const PAGINA: PaginaBio = {
  id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c01",
  tenantId: "tenant-exemplo",
  slug: "loja-exemplo",
  publicada: false,
  bloqueadaEm: null,
  documento: documento([ZAP, GRUPO]),
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};
const CONTEXTO: ContextoDoEditor = {
  campanhas: CAMPANHAS,
  dominio: null,
  origemGirumo: "https://www.girumo.com.br/",
  sugestaoSlug: "loja-exemplo",
  linksEscondidos: [ZAP.id],
};

test("dados da prévia: o rascunho, só as campanhas com link, os escondidos como a página vai ver, origem Girumo", () => {
  const rascunho = documento([ZAP, GRUPO, GRUPO_SEM_LINK]);
  const d = dadosDaPrevia(PAGINA, rascunho, CONTEXTO);
  assert.equal(d.documento, rascunho);
  assert.equal(d.paginaId, PAGINA.id);
  assert.deepEqual(d.campanhas, { [CAMPANHAS[0].id]: "vip-atacado" });
  assert.deepEqual(d.linksEscondidos, [ZAP.id, GRUPO_SEM_LINK.id]);
  assert.equal(d.origem, "https://www.girumo.com.br");
  assert.equal(d.dominioProprio, false);
  // Trocou o número no rascunho: a prévia já mostra o botão (o salvar confere de novo).
  assert.deepEqual(dadosDaPrevia(PAGINA, documento([{ ...ZAP, numero: "5562988887777" }]), CONTEXTO).linksEscondidos, []);
});

test("domínio próprio: a prévia monta os links como a raiz do domínio vai montar", () => {
  const d = dadosDaPrevia(PAGINA, PAGINA.documento, { ...CONTEXTO, dominio: "links.loja.com.br" });
  assert.equal(d.origem, "https://links.loja.com.br");
  assert.equal(d.dominioProprio, true);
});

test("escondidos na tela = links com aviso, na ordem da lista", () => {
  assert.deepEqual(
    escondidosNaTela([GRUPO_SEM_LINK, ZAP, GRUPO], { campanhas: CAMPANHAS, linksEscondidos: [ZAP.id], salvos: [ZAP] }),
    [GRUPO_SEM_LINK.id, ZAP.id],
  );
});

test("nome de cada modelo no chip da prévia", () => {
  assert.deepEqual(NOME_DO_MODELO, { etiqueta: "Etiqueta", vitrine: "Vitrine", romaneio: "Romaneio", classico: "Clássico" });
});

test("guarda de saída: só clique comum, num link do próprio app, para outra tela", () => {
  const aqui = { origin: "https://app.girumo.com.br", pathname: "/painel/link-da-bio", search: "" };
  const clique = (href: string, o: Partial<CliqueLido> = {}, alvo: Partial<NonNullable<CliqueLido["alvo"]>> = {}): CliqueLido => ({
    defaultPrevented: false,
    button: 0,
    comModificador: false,
    alvo: { href, target: "", download: false, ...alvo },
    ...o,
  });
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel/campanhas?aba=1#x"), aqui), "/painel/campanhas?aba=1#x");
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", {}, { target: "_self" }), aqui), "/painel");
  // Outro site: quem pergunta é o beforeunload do navegador.
  assert.equal(destinoInterno(clique("https://www.girumo.com.br/bio/loja-exemplo"), aqui), null);
  // Mesma tela (só a âncora muda), aba nova, download, Ctrl/⌘, botão do meio, já tratado: não intercepta.
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel/link-da-bio#links"), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", {}, { target: "_blank" }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", {}, { download: true }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", { comModificador: true }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", { button: 1 }), aqui), null);
  assert.equal(destinoInterno(clique("https://app.girumo.com.br/painel", { defaultPrevented: true }), aqui), null);
  assert.equal(destinoInterno({ defaultPrevented: false, button: 0, comModificador: false, alvo: null }, aqui), null);
});
