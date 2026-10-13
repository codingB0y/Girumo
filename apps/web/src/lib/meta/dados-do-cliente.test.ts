import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { hashesDoCliente, sha256Hex, type DadosDoCliente } from "./dados-do-cliente";

const h = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const AGORA = new Date("2026-10-13T12:00:00Z");

const VAZIO: DadosDoCliente = {
  nome: null,
  pessoaFisica: true,
  emails: [],
  telefones: [],
  nascimento: null,
  sexo: null,
  cidade: null,
  uf: null,
  cep: null,
  pais: "Portugal",
};

const MARIA: DadosDoCliente = {
  nome: "Maria  da Silva Souza",
  pessoaFisica: true,
  emails: ["Maria@X.com"],
  telefones: ["(62) 99819-1314"],
  nascimento: "1990-05-07",
  sexo: "F",
  cidade: "Goiânia",
  uf: "GO",
  cep: "74000-000",
  pais: "Brasil",
};

test("sha256Hex: hex minúsculo do UTF-8 (valor conhecido)", () => {
  assert.equal(sha256Hex("maria@x.com"), "81e785e102ec084f5abc6a5ffccf485ab4c69a9ac23ecca5992beeab50a2438b");
  assert.equal(sha256Hex("goiânia"), h("goiânia"));
});

test("pessoa física completa: todos os campos normalizados e em hash", () => {
  assert.deepEqual(hashesDoCliente(MARIA, "6298191314", AGORA), {
    em: ["81e785e102ec084f5abc6a5ffccf485ab4c69a9ac23ecca5992beeab50a2438b"],
    // celular como veio (com o 9) primeiro, depois sem o 9
    ph: ["f4103b541e50de3c3646c081ccd27a5b24f68e705c306824093984f96bdb7940", h("556298191314")],
    fn: h("maria"),
    ln: h("souza"),
    db: h("19900507"),
    doby: h("1990"),
    dobm: h("05"),
    dobd: h("07"),
    ge: h("f"),
    ct: h("goiânia"),
    st: h("go"),
    zp: h("74000000"),
    country: h("br"),
    external_id: h("6298191314"),
  });
});

test("telefone: celular com e sem o 9, fixo sem variante, sempre com o 55", () => {
  const ph = (telefones: string[]) => hashesDoCliente({ ...VAZIO, telefones }, null, AGORA).ph;
  assert.deepEqual(ph(["6298191314"]), [h("556298191314"), h("5562998191314")]);
  assert.deepEqual(ph(["(62) 3221-1100"]), [h("556232211100")]);
  // celular e telefone iguais em formatos diferentes: sem repetição
  assert.deepEqual(ph(["62998191314", "+55 62 99819-1314"]), [h("5562998191314"), h("556298191314")]);
});

test("telefone: DDD 55 (Santa Maria/RS) não vira um número sem país", () => {
  // variantesDoTelefone devolve "5532221100" (nacional, DDD 55) — começa com 55,
  // mas não tem o país; o Meta leria 55 + DDD 32 + 6 dígitos.
  const r = hashesDoCliente({ ...VAZIO, telefones: ["(55) 3222-1100"] }, null, AGORA);
  assert.deepEqual(r.ph, [h("555532221100")]);
});

test("telefone inválido ou vazio: sem ph", () => {
  assert.equal("ph" in hashesDoCliente({ ...VAZIO, telefones: ["123", "", "abc"] }, null, AGORA), false);
});

test("e-mails: separados por vírgula, ponto e vírgula e espaço; minúsculos; inválidos e repetidos fora", () => {
  const r = hashesDoCliente(
    { ...VAZIO, emails: ["Maria@X.com; compras@loja.com.br", " maria@x.com ", "a@x.com b@y.com", "sem-arroba", "a@b", ""] },
    null,
    AGORA,
  );
  assert.deepEqual(r.em, [h("maria@x.com"), h("compras@loja.com.br"), h("a@x.com"), h("b@y.com")]);
});

test("nome: sem pontuação nem dígito, acento mantido, primeiro e último", () => {
  const nomes = (nome: string) => {
    const r = hashesDoCliente({ ...VAZIO, nome }, null, AGORA);
    return [r.fn, r.ln];
  };
  assert.deepEqual(nomes("Valéry  Ângela D'Ávila."), [h("valéry"), h("dávila")]);
  assert.deepEqual(nomes("  Maria 2 "), [h("maria"), undefined]); // uma palavra só: sem ln
  assert.deepEqual(nomes("!!! 123"), [undefined, undefined]);
});

test("grafia Unicode decomposta (NFD) dá o mesmo hash da composta", () => {
  const nfd = hashesDoCliente({ ...VAZIO, nome: "Valéry Souza", cidade: "Goiânia" }, null, AGORA);
  assert.equal(nfd.fn, h("valéry"));
  assert.equal(nfd.ct, h("goiânia"));
});

test("PJ não leva nome, nascimento nem sexo; o resto vai", () => {
  const r = hashesDoCliente({ ...MARIA, nome: "Loja Bela LTDA", pessoaFisica: false }, "6298191314", AGORA);
  for (const campo of ["fn", "ln", "db", "doby", "dobm", "dobd", "ge"]) {
    assert.equal(campo in r, false, `PJ não pode levar ${campo}`);
  }
  assert.ok(r.em && r.ph && r.ct && r.st && r.zp && r.country && r.external_id);
});

test("nascimento: só data real com ano entre 1900 e o ano corrente", () => {
  const db = (nascimento: string) => hashesDoCliente({ ...VAZIO, nascimento }, null, AGORA).db;
  assert.equal(db("1900-01-01"), h("19000101"));
  assert.equal(db("2026-01-01"), h("20260101"));
  for (const invalida of ["1990-02-30", "1899-12-31", "2027-01-01", "0000-00-00", "07/05/1990", "1990-5-7", ""]) {
    assert.equal(db(invalida), undefined, invalida);
  }
});

test("cidade: sem dígito, pontuação nem espaço; acento mantido", () => {
  const ct = (cidade: string) => hashesDoCliente({ ...VAZIO, cidade }, null, AGORA).ct;
  assert.equal(ct("São José dos Campos"), h("sãojosédoscampos"));
  assert.equal(ct("Santa Bárbara d'Oeste"), h("santabárbaradoeste"));
  assert.equal(ct("  123 - "), undefined);
});

test("UF de 2 letras; CEP de 8 dígitos", () => {
  const r = (uf: string, cep: string) => hashesDoCliente({ ...VAZIO, uf, cep }, null, AGORA);
  assert.equal(r(" Sp ", "74.000-000").st, h("sp"));
  assert.equal(r(" Sp ", "74.000-000").zp, h("74000000"));
  assert.equal(r("São Paulo", "7400000").st, undefined);
  assert.equal(r("S", "7400000").zp, undefined);
});

test("país: vazio ou Brasil (caixa e acento à parte) → br; outro → sem país", () => {
  for (const pais of [null, "", "Brasil", "BRASIL", " brazil ", "Brásil"]) {
    assert.equal(hashesDoCliente({ ...VAZIO, pais }, null, AGORA).country, h("br"), String(pais));
  }
  assert.equal("country" in hashesDoCliente({ ...VAZIO, pais: "Portugal" }, null, AGORA), false);
});

test("external_id só com chave", () => {
  assert.equal(hashesDoCliente(VAZIO, "6298191314", AGORA).external_id, h("6298191314"));
  assert.equal("external_id" in hashesDoCliente(VAZIO, null, AGORA), false);
  assert.equal("external_id" in hashesDoCliente(VAZIO, "", AGORA), false);
});

test("nunca hash de string vazia: cliente sem nada → objeto vazio", () => {
  assert.deepEqual(hashesDoCliente(VAZIO, null, AGORA), {});
  const tudo = JSON.stringify(hashesDoCliente({ ...MARIA, nome: " ", cidade: " ", uf: "", cep: "" }, "", AGORA));
  assert.equal(tudo.includes(h("")), false);
});

test("não muta a entrada", () => {
  const emails = ["Maria@X.com"];
  const entrada = { ...MARIA, emails };
  hashesDoCliente(entrada, null, AGORA);
  assert.deepEqual(emails, ["Maria@X.com"]);
  assert.equal(entrada.nome, "Maria  da Silva Souza");
});
