import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAMINHO_ALLOWLIST,
  diffLints,
  formatarRelatorio,
  lerProjetos,
  normalizarLint,
  type Achado,
  type EntradaAllowlist,
  type Lint,
} from "./check-advisors.ts";

function lint(cacheKey: string, nome = "authenticated_security_definer_function_executable"): Lint {
  return {
    name: nome,
    title: "t",
    level: "WARN",
    detail: `Function \`public.${cacheKey}\` can be executed by the \`authenticated\` role`,
    cacheKey,
    metadata: { name: cacheKey, schema: "public" },
  };
}

const achado = (projeto: string, cacheKey: string): Achado => ({ projeto, lint: lint(cacheKey) });

const tolera = (chave: string): EntradaAllowlist => ({
  lint: chave,
  motivo: "m",
  desde: "2026-08-31",
  prazo: "2026-09-30",
});

test("lerProjetos aceita `rotulo=ref` separado por virgula", () => {
  assert.deepEqual(lerProjetos("dev=abc123,prod=xyz789"), [
    { rotulo: "dev", ref: "abc123" },
    { rotulo: "prod", ref: "xyz789" },
  ]);
  assert.deepEqual(lerProjetos("  dev = abc123 , prod = xyz789  "), [
    { rotulo: "dev", ref: "abc123" },
    { rotulo: "prod", ref: "xyz789" },
  ]);
});

test("lerProjetos trata ausencia como lista vazia, e nao como erro", () => {
  // O gate pula sem credencial em vez de reprovar: CI vermelho por falta de
  // segredo ensina o time a ignorar o gate.
  assert.deepEqual(lerProjetos(undefined), []);
  assert.deepEqual(lerProjetos(""), []);
});

test("lerProjetos reprova formato malformado em vez de adivinhar", () => {
  assert.throws(() => lerProjetos("soRef"), /ADVISOR_PROJECT_REFS malformado/);
  assert.throws(() => lerProjetos("dev=abc,=xyz"), /ADVISOR_PROJECT_REFS malformado/);
});

test("lint fora da allowlist bloqueia; o que esta nela apenas e reportado", () => {
  const resultado = diffLints(
    [achado("prod", "conhecido"), achado("dev", "novo_em_folha")],
    [tolera("conhecido")],
  );

  assert.deepEqual(
    resultado.bloqueantes.map((a) => a.lint.cacheKey),
    ["novo_em_folha"],
  );
  assert.deepEqual(
    resultado.tolerados.map((a) => a.lint.cacheKey),
    ["conhecido"],
  );
});

test("o mesmo lint em bancos diferentes conta como dois achados", () => {
  // Um privilegio sobrando so em dev e exatamente o caso do PR #190: se o gate
  // deduplicasse por cacheKey, o achado de dev sumiria atras do de prod.
  const resultado = diffLints([achado("prod", "x"), achado("dev", "x")], []);
  assert.equal(resultado.bloqueantes.length, 2);
  assert.deepEqual(resultado.bloqueantes.map((a) => a.projeto).sort(), ["dev", "prod"]);
});

test("allowlist cuja falha ja sumiu e sinalizada como ociosa", () => {
  const resultado = diffLints([], [tolera("ja_resolvido")]);
  assert.deepEqual(resultado.allowlistOciosa, ["ja_resolvido"]);
  assert.match(formatarRelatorio(resultado), /Allowlist ociosa/);
});

test("o relatorio imprime a chave exata a colar na allowlist", () => {
  // Sem isso, quem ve o gate vermelho tem que adivinhar o formato do cacheKey.
  const relatorio = formatarRelatorio(diffLints([achado("prod", "chave_exata")], []));
  assert.match(relatorio, /allowlist: "chave_exata"/);
});

test("toda entrada da allowlist tem motivo e prazo", () => {
  // Regra do arquivo: allowlist sem prazo vira cemiterio e o gate para de
  // significar algo. O mesmo contrato do drift-allowlist.json.
  const bruto = JSON.parse(readFileSync(CAMINHO_ALLOWLIST, "utf8")) as {
    entradas: EntradaAllowlist[];
  };

  for (const entrada of bruto.entradas) {
    assert.ok(entrada.lint, "entrada sem `lint` (cacheKey)");
    assert.ok(
      entrada.motivo && entrada.motivo.length > 20,
      `entrada ${entrada.lint} sem motivo explicativo`,
    );
    assert.match(entrada.desde, /^\d{4}-\d{2}-\d{2}$/, `entrada ${entrada.lint} sem \`desde\``);
    assert.match(entrada.prazo, /^\d{4}-\d{2}-\d{2}$/, `entrada ${entrada.lint} sem \`prazo\``);
  }
});

test("normalizarLint aceita a grafia da API (cache_key) e a do CLI (cacheKey)", () => {
  // O bug de 31/08/2026: a allowlist nasceu da saida do CLI (`cacheKey`) e o
  // script le a Management API (`cache_key`). A identidade virava `undefined`,
  // nada casava com a allowlist, e o gate reprovou 12 lints ja tolerados
  // enquanto reportava as 5 entradas como ociosas.
  const base = { name: "n", title: "t", level: "WARN", detail: "d" };

  assert.equal(normalizarLint({ ...base, cache_key: "chave_api" }).cacheKey, "chave_api");
  assert.equal(normalizarLint({ ...base, cacheKey: "chave_cli" }).cacheKey, "chave_cli");
});

test("lint sem identidade reprova alto, em vez de virar `undefined`", () => {
  // Sem chave nenhum lint casa com a allowlist e o gate reprova tudo sem dizer
  // por que. Melhor falhar com a causa do que produzir um relatorio mentiroso.
  assert.throws(
    () => normalizarLint({ name: "n", title: "t", level: "WARN", detail: "d" }),
    /Lint sem identidade/,
  );
});
