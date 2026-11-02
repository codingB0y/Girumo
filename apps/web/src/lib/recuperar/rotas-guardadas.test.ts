import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Estrutural do Recuperar (mesmo padrão de `lib/auth/memberships-allowlist.test.ts`):
 * toda rota do módulo exige o add-on, em cada handler exportado (`export function`;
 * `export const GET =` é recusado). Sem `await requireRecuperar(req)`, a loja que não
 * assinou (ou que cancelou) continua lendo e escrevendo no módulo. Comentário não conta.
 */

/** apps/web/src/app/api/recuperar — este arquivo mora em src/lib/recuperar. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "api", "recuperar");

/** O status responde `enabled: false` à loja sem o add-on: é a única que não pode exigi-lo. */
const SEM_GUARDA = new Set(["status/route.ts"]);

const rotas = existsSync(RAIZ)
  ? readdirSync(RAIZ, { recursive: true, encoding: "utf8" })
      .map((relativo) => relativo.replaceAll("\\", "/"))
      .filter((arquivo) => /(^|\/)route\.ts$/.test(arquivo))
      .sort()
  : [];

const fonte = (rota: string) => readFileSync(join(RAIZ, rota), "utf8");

const semComentario = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const HANDLER = /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/g;
const HANDLER_CONST = /\bexport\s+const\s+(?:GET|POST|PUT|PATCH|DELETE)\b/;
const GUARDA = /\bawait\s+requireRecuperar\(\s*req\b/g;
const contar = (codigo: string, re: RegExp) => (codigo.match(re) ?? []).length;

test("toda rota do módulo exige o add-on em cada handler, menos o status", () => {
  const sem = rotas.filter((r) => {
    if (SEM_GUARDA.has(r)) return false;
    const codigo = semComentario(fonte(r));
    const handlers = contar(codigo, HANDLER);
    return HANDLER_CONST.test(codigo) || handlers === 0 || contar(codigo, GUARDA) < handlers;
  });
  assert.deepEqual(sem, [], "rota do Recuperar com handler sem `await requireRecuperar(req)`");
});

test("o status responde à loja sem o add-on: não chama requireRecuperar e existe", () => {
  assert.ok(rotas.includes("status/route.ts"));
  assert.equal(contar(semComentario(fonte("status/route.ts")), GUARDA), 0);
});
