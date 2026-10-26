// apps/web/src/lib/bio/editor-divulgar.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { LinkBio } from "@/lib/bio/documento";
import type { RelatorioBio } from "@/lib/stores/bio-pages";

import {
  avisoDoSlug,
  ehRelatorioBio,
  ehRespostaDoSlug,
  motivoLocalDoSlug,
  prefixoDoSlug,
  resumoDoRelatorio,
  slugDoCampo,
  textoDoNoAr,
} from "./editor-divulgar";

// Dados fictícios: nada da loja-piloto (repo público).
const ZAP: LinkBio = {
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
const GRUPO: LinkBio = {
  id: "6f1c2b9e-0a1d-4c3e-9b2a-1d2e3f4a5b02",
  tipo: "grupo",
  titulo: "Entrar no grupo VIP",
  sub: "",
  icone: "coroa",
  ativo: true,
  destaque: false,
  campanhaId: "0b7d6c5e-4f3a-4b2c-8d1e-0f9a8b7c6d01",
};
const P = "girumo.com.br/bio/";

test("endereço digitado vira slug: minúsculo, sem acento, espaço vira hífen, até 40; o hífen do fim espera a próxima letra", () => {
  assert.equal(slugDoCampo("Ateliê Exemplo"), "atelie-exemplo");
  assert.equal(slugDoCampo("loja_kids  2026"), "loja-kids-2026");
  assert.equal(slugDoCampo("--Loja!@#"), "loja");
  assert.equal(slugDoCampo("loja-"), "loja-");
  assert.equal(slugDoCampo("a".repeat(50)).length, 40);
});

test("formato e reservado sem ir ao servidor; em uso só a API diz", () => {
  assert.equal(motivoLocalDoSlug("ab"), "formato");
  assert.equal(motivoLocalDoSlug("loja-"), "formato");
  assert.equal(motivoLocalDoSlug("a".repeat(41)), "formato");
  assert.equal(motivoLocalDoSlug("loja-girumo"), "reservado");
  assert.equal(motivoLocalDoSlug("atelie-exemplo"), null);
});

test("aviso do endereço: atual, formato, conferindo, livre, em uso e falha de rede; resposta de outro slug não vale", () => {
  assert.deepEqual(avisoDoSlug("atelie-exemplo", "atelie-exemplo", null, P), { texto: "Este é o endereço atual da página.", tom: "neutro" });
  assert.deepEqual(avisoDoSlug("ab", "atelie-exemplo", null, P), {
    texto: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
    tom: "erro",
  });
  assert.deepEqual(avisoDoSlug("loja-girumo", "atelie-exemplo", null, P), { texto: "Esse endereço é reservado. Escolha outro.", tom: "erro" });
  assert.equal(avisoDoSlug("atelie-novo", "atelie-exemplo", null, P).texto, "Conferindo se está livre…");
  // A resposta de "atelie-nov" chegou depois de digitar o "o": ainda conferindo.
  assert.equal(
    avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-nov", resposta: { disponivel: true } }, P).texto,
    "Conferindo se está livre…",
  );
  assert.deepEqual(avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-novo", resposta: { disponivel: true } }, P), {
    texto: "Livre: girumo.com.br/bio/atelie-novo",
    tom: "ok",
  });
  assert.deepEqual(
    avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-novo", resposta: { disponivel: false, motivo: "em-uso" } }, P),
    { texto: "Esse endereço já está em uso. Escolha outro.", tom: "erro" },
  );
  assert.deepEqual(avisoDoSlug("atelie-novo", "atelie-exemplo", { slug: "atelie-novo", resposta: null }, P), {
    texto: "Não deu pra conferir agora. Se estiver em uso, o salvar avisa.",
    tom: "neutro",
  });
});

test("começo do endereço: o host da Girumo sem www; sem origem que preste, o da produção", () => {
  assert.equal(prefixoDoSlug("https://www.girumo.com.br"), "girumo.com.br/bio/");
  assert.equal(prefixoDoSlug("http://localhost:3000/"), "localhost:3000/bio/");
  assert.equal(prefixoDoSlug("lixo"), "girumo.com.br/bio/");
});

test("respostas da API: só o formato do contrato passa", () => {
  assert.equal(ehRespostaDoSlug({ disponivel: true }), true);
  assert.equal(ehRespostaDoSlug({ disponivel: false, motivo: "em-uso" }), true);
  assert.equal(ehRespostaDoSlug({ disponivel: false, motivo: "outro" }), false);
  assert.equal(ehRespostaDoSlug(null), false);
  const ok: RelatorioBio = { visitas: 3, toques: 1, porLink: [{ linkId: ZAP.id, toques: 1 }], porDia: [] };
  assert.equal(ehRelatorioBio(ok), true);
  assert.equal(ehRelatorioBio({ ...ok, visitas: "3" }), false);
  assert.equal(ehRelatorioBio({ ...ok, porLink: [{ linkId: 1, toques: 1 }] }), false);
  assert.equal(ehRelatorioBio({ visitas: 3, toques: 1 }), false);
});

test("Página no ar: o que vale agora e o que muda ao salvar; bloqueada manda", () => {
  assert.equal(textoDoNoAr(true, true, false), "No ar: quem abre o endereço vê a página.");
  assert.equal(textoDoNoAr(true, false, false), "Vai pro ar quando você salvar.");
  assert.equal(textoDoNoAr(false, true, false), "Sai do ar quando você salvar.");
  assert.equal(textoDoNoAr(false, false, false), "Fora do ar: quem abre o endereço vê “Página não encontrada”.");
  assert.match(textoDoNoAr(true, true, true), /^A Girumo tirou esta página do ar/);
});

test("números: milhar com ponto, toques por visita com até 2 casas e passando de 1, botões do mais tocado, os que saíram somados", () => {
  const r: RelatorioBio = {
    visitas: 1234,
    toques: 470,
    porLink: [
      { linkId: GRUPO.id, toques: 120 },
      { linkId: ZAP.id, toques: 300 },
      { linkId: "9f0e8d7c-0000-4000-8000-000000000001", toques: 30 },
      { linkId: "9f0e8d7c-0000-4000-8000-000000000002", toques: 20 },
    ],
    porDia: [],
  };
  assert.deepEqual(resumoDoRelatorio(r, [ZAP, GRUPO]), {
    vazio: false,
    visitas: "1.234",
    toques: "470",
    porVisita: "0,38",
    linhas: [
      { chave: ZAP.id, titulo: "Falar com a vendedora", toques: "300" },
      { chave: GRUPO.id, titulo: "Entrar no grupo VIP", toques: "120" },
      { chave: "saiu", titulo: "Links que saíram da página", toques: "50" },
    ],
  });
  assert.equal(resumoDoRelatorio({ visitas: 10, toques: 25, porLink: [], porDia: [] }, []).porVisita, "2,5");
  const nada = resumoDoRelatorio({ visitas: 0, toques: 0, porLink: [{ linkId: ZAP.id, toques: 0 }], porDia: [] }, [ZAP]);
  assert.equal(nada.vazio, true);
  assert.equal(nada.porVisita, "—");
  assert.deepEqual(nada.linhas, []);
});
