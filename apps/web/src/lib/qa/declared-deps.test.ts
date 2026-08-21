import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nomeDoPacote,
  pacotesImportados,
  pacotesNaoDeclarados,
  semComentarios,
} from "./declared-deps";

test("ignora caminho relativo, alias do projeto e builtin do Node", () => {
  assert.equal(nomeDoPacote("./vizinho"), null);
  assert.equal(nomeDoPacote("../pai"), null);
  assert.equal(nomeDoPacote("@/lib/utils"), null);
  assert.equal(nomeDoPacote("node:fs"), null);
  // Builtin sem o prefixo continua sendo builtin — nao vira pacote fantasma.
  assert.equal(nomeDoPacote("fs"), null);
  assert.equal(nomeDoPacote("crypto"), null);
});

test("reduz o specifier ao nome do pacote, com e sem escopo", () => {
  assert.equal(nomeDoPacote("dotenv"), "dotenv");
  assert.equal(nomeDoPacote("next/font/google"), "next");
  assert.equal(nomeDoPacote("@supabase/supabase-js"), "@supabase/supabase-js");
  assert.equal(nomeDoPacote("@supabase/supabase-js/dist/module"), "@supabase/supabase-js");
  assert.equal(nomeDoPacote("@escopo-sozinho"), null);
});

test("comentario que fala de import nao vira dependencia", () => {
  // Regressao real: o comentario que documenta o regex em
  // component-reachability.ts fez a primeira versao acusar um pacote "x".
  const arquivos = [
    {
      path: "src/exemplo.ts",
      content: [
        '/** Captura `from "x"` e `import("y")` — so documentacao. */',
        '// tambem ignora isto: from "z"',
        'import real from "pacote-de-verdade";',
      ].join("\n"),
    },
  ];

  const achados = pacotesImportados(arquivos);
  assert.deepEqual([...achados.keys()], ["pacote-de-verdade"]);
});

test("nao estraga string que contem barras duplas", () => {
  const codigo = 'const url = "https://exemplo.com/a"; import x from "pacote";';
  const limpo = semComentarios(codigo);

  assert.ok(limpo.includes("https://exemplo.com/a"), "a URL foi comida como comentario");
  assert.deepEqual([...pacotesImportados([{ path: "a.ts", content: codigo }]).keys()], ["pacote"]);
});

test("pega import dinamico e require, nao so o estatico", () => {
  const arquivos = [
    { path: "a.ts", content: 'const m = await import("dinamico");' },
    { path: "b.js", content: 'const m = require("velho");' },
    { path: "c.ts", content: 'import "efeito-colateral";' },
  ];

  assert.deepEqual([...pacotesImportados(arquivos).keys()].sort(), [
    "dinamico",
    "efeito-colateral",
    "velho",
  ]);
});

test("acusa o pacote importado que o package.json nao declara", () => {
  // O caso de 21/08: `dotenv` usado em apps/web e declarado so na raiz.
  const achados = pacotesNaoDeclarados({
    arquivos: [
      { path: "playwright.config.ts", content: 'import { config } from "dotenv";' },
      { path: "src/a.ts", content: 'import next from "next";' },
    ],
    declarados: ["next"],
  });

  assert.deepEqual(achados, [{ pacote: "dotenv", exemplo: "playwright.config.ts" }]);
});

test("nao acusa nada quando tudo esta declarado", () => {
  const achados = pacotesNaoDeclarados({
    arquivos: [{ path: "src/a.ts", content: 'import x from "declarado";' }],
    declarados: ["declarado", "sobrando"],
  });

  assert.deepEqual(achados, []);
});
