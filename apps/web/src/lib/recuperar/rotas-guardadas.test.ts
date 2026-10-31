import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Estrutural do Recuperar (mesmo padrão de `lib/auth/memberships-allowlist.test.ts`):
 * toda rota do módulo exige o add-on. Sem `requireRecuperar(req)`, a loja que não
 * assinou (ou que cancelou) continua lendo e escrevendo no módulo.
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

test("toda rota do módulo exige o add-on, menos o status", () => {
  const sem = rotas.filter((r) => !SEM_GUARDA.has(r) && !fonte(r).includes("requireRecuperar("));
  assert.deepEqual(sem, [], "rota do Recuperar sem requireRecuperar(req): sem isso a loja desligada continua usando o módulo");
});

test("o status responde à loja sem o add-on: não chama requireRecuperar e existe", () => {
  assert.ok(rotas.includes("status/route.ts"));
  assert.equal(fonte("status/route.ts").includes("requireRecuperar("), false);
});
