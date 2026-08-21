import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { pacotesNaoDeclarados, type ArquivoDeCodigo } from "./declared-deps";

/**
 * Gate: pacote importado em apps/web tem que estar declarado em apps/web.
 *
 * Nasceu de 21/08/2026, quando nenhum deploy subiu por ~4h. O
 * `playwright.config.ts` importava `dotenv` sem a dependencia declarada aqui;
 * como `dotenv` esta no `package.json` da RAIZ do monorepo, local e CI
 * resolviam por hoisting e ficavam verdes. A Vercel builda com Root Directory
 * em apps/web, enxerga so o package.json de la, e o build morria no typecheck.
 *
 * Por que um teste e nao o build: qualquer build que rode a partir da raiz tem o
 * hoisting a favor e **nunca** vai flagrar isto. O CI nao pode "tentar mais
 * forte" — a assimetria e estrutural. O que funciona e comparar o texto do
 * codigo com o texto do package.json, que e o que este arquivo faz.
 *
 * Roda no `npm test`, que o `verify-local.ps1` chama — ou seja, em todo PR.
 */

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const DIRETORIOS_IGNORADOS = new Set([
  "node_modules",
  ".next",
  "build",
  "dist",
  "coverage",
  "e2e-report",
  "e2e-results",
  // Starter de exemplo, fora do tsconfig e fora do build: as deps dele nao sao
  // as deste app, e cobra-las aqui so geraria ruido.
  "nextjs-claude-code-starter",
]);

const EXTENSOES = /\.(?:[cm]?tsx?|[cm]?js)$/;

/**
 * Arquivo de teste fica fora da varredura: fixture de teste carrega CODIGO EM
 * STRING (`content: 'import x from "pacote"'`), e sem AST nao ha como separar
 * isso de um import de verdade — os proprios testes deste modulo apareciam como
 * dependencias fantasma. Mesma escolha de `orphan-components.test.ts`.
 *
 * O que se perde e pequeno: teste nao vai para o build, entao dependencia so-de
 * teste nao declarada nao derruba deploy — que e o risco que este gate existe
 * para cobrir.
 */
const ARQUIVO_DE_TESTE = /\.(?:test|spec)\.[cm]?tsx?$/;

function lerArvore(raiz: string): ArquivoDeCodigo[] {
  const arquivos: ArquivoDeCodigo[] = [];

  const walk = (absoluto: string) => {
    for (const entrada of readdirSync(absoluto)) {
      if (DIRETORIOS_IGNORADOS.has(entrada)) continue;
      const caminho = path.join(absoluto, entrada);
      if (statSync(caminho).isDirectory()) {
        walk(caminho);
        continue;
      }
      if (!EXTENSOES.test(entrada) || ARQUIVO_DE_TESTE.test(entrada)) continue;
      arquivos.push({
        path: path.relative(raiz, caminho).split(path.sep).join("/"),
        content: readFileSync(caminho, "utf8"),
      });
    }
  };

  walk(raiz);
  return arquivos;
}

function declaradosNoPackageJson(raiz: string): string[] {
  const pkg = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ];
}

test("todo pacote importado em apps/web esta declarado em apps/web", () => {
  const achados = pacotesNaoDeclarados({
    arquivos: lerArvore(WEB_ROOT),
    declarados: declaradosNoPackageJson(WEB_ROOT),
  });

  const detalhe = achados.map((a) => `  ${a.pacote}  (ex.: ${a.exemplo})`).join("\n");

  assert.deepEqual(
    achados,
    [],
    "Pacote importado em apps/web e ausente do package.json de apps/web.\n" +
      "Local e CI passam por hoisting da raiz do monorepo; a Vercel builda com\n" +
      "Root Directory em apps/web e vai falhar. Declare a dependencia aqui:\n" +
      `${detalhe}\n`,
  );
});
