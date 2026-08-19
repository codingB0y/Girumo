import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectReachable,
  extractImports,
  findOrphanComponents,
  isEntryPoint,
  type SourceFile,
} from "./component-reachability";

function file(path: string, content = ""): SourceFile {
  return { path, content };
}

test("page, layout e route sao raiz; arquivo solto em src/app nao e", () => {
  assert.equal(isEntryPoint("src/app/painel/page.tsx"), true);
  assert.equal(isEntryPoint("src/app/painel/layout.tsx"), true);
  assert.equal(isEntryPoint("src/app/api/groups/route.ts"), true);
  assert.equal(isEntryPoint("src/app/painel/helpers.ts"), false);
});

test("middleware conta como raiz mesmo fora de src/app", () => {
  assert.equal(isEntryPoint("src/middleware.ts"), true);
});

// O ponto do #114: o componente orfao TINHA teste. Se teste fosse raiz, o
// guard aprovaria exatamente o caso que ele existe para pegar.
test("arquivo de teste nunca e raiz", () => {
  assert.equal(isEntryPoint("src/app/painel/page.test.tsx"), false);
  assert.equal(isEntryPoint("src/middleware.test.ts"), false);
});

test("resolve alias @/ e caminho relativo", () => {
  const imports = extractImports(
    file(
      "src/app/painel/page.tsx",
      `import { Painel } from "@/components/painel/shell";
       import { helper } from "./helper";
       import { outro } from "../compartilhado";`,
    ),
  );
  assert.deepEqual(imports, [
    "src/components/painel/shell",
    "src/app/painel/helper",
    "src/app/compartilhado",
  ]);
});

test("pacote de node_modules e ignorado", () => {
  assert.deepEqual(extractImports(file("src/app/page.tsx", `import React from "react";`)), []);
});

// next/dynamic e como varios paineis carregam componente pesado; sem isso o
// guard acusaria orfao no que esta na tela.
test("import() dinamico conta como uso", () => {
  const imports = extractImports(
    file("src/app/page.tsx", `const C = dynamic(() => import("@/components/pesado"));`),
  );
  assert.deepEqual(imports, ["src/components/pesado"]);
});

test("re-export encadeia o alcance", () => {
  const files = [
    file("src/app/page.tsx", `import { Botao } from "@/components/ui";`),
    file("src/components/ui/index.ts", `export { Botao } from "./botao";`),
    file("src/components/ui/botao.tsx", "export function Botao() { return null; }"),
  ];
  assert.equal(collectReachable(files).has("src/components/ui/botao.tsx"), true);
});

test("import sem extensao resolve .tsx e index", () => {
  const files = [
    file("src/app/page.tsx", `import "@/components/card"; import "@/components/lista";`),
    file("src/components/card.tsx", ""),
    file("src/components/lista/index.tsx", ""),
  ];
  const reachable = collectReachable(files);
  assert.equal(reachable.has("src/components/card.tsx"), true);
  assert.equal(reachable.has("src/components/lista/index.tsx"), true);
});

test("ciclo entre componentes nao trava a varredura", () => {
  const files = [
    file("src/app/page.tsx", `import "@/components/a";`),
    file("src/components/a.tsx", `import "@/components/b";`),
    file("src/components/b.tsx", `import "@/components/a";`),
  ];
  assert.equal(collectReachable(files).size, 3);
});

test("componente que nenhuma rota importa e acusado", () => {
  const files = [
    file("src/app/painel/page.tsx", `import { Usado } from "@/components/usado";`),
    file("src/components/usado.tsx", ""),
    file("src/components/orfao.tsx", ""),
  ];
  assert.deepEqual(findOrphanComponents(files).orphans, ["src/components/orfao.tsx"]);
});

// Reproduz o #114 fielmente: componente + teste, nenhuma pagina importando.
test("ter teste nao salva o componente de ser orfao", () => {
  const files = [
    file("src/app/painel/page.tsx", ""),
    file("src/components/revogar-convite.tsx", ""),
    file("src/components/revogar-convite.test.ts", `import "./revogar-convite";`),
  ];
  assert.deepEqual(findOrphanComponents(files).orphans, ["src/components/revogar-convite.tsx"]);
});

test("allowlist silencia orfao conhecido", () => {
  const files = [file("src/app/page.tsx", ""), file("src/components/preview.tsx", "")];
  const { orphans } = findOrphanComponents(files, { allowlist: ["src/components/preview.tsx"] });
  assert.deepEqual(orphans, []);
});

// Sem isto a allowlist vira cemiterio e para de significar alguma coisa.
test("allowlist de componente que voltou a ser usado e reportada como obsoleta", () => {
  const files = [
    file("src/app/page.tsx", `import "@/components/preview";`),
    file("src/components/preview.tsx", ""),
  ];
  const { orphans, staleAllowlist } = findOrphanComponents(files, {
    allowlist: ["src/components/preview.tsx"],
  });
  assert.deepEqual(orphans, []);
  assert.deepEqual(staleAllowlist, ["src/components/preview.tsx"]);
});

test("allowlist apontando para arquivo que sumiu tambem e obsoleta", () => {
  const files = [file("src/app/page.tsx", "")];
  const { staleAllowlist } = findOrphanComponents(files, {
    allowlist: ["src/components/apagado.tsx"],
  });
  assert.deepEqual(staleAllowlist, ["src/components/apagado.tsx"]);
});

test("fora do prefixo vigiado nada e cobrado", () => {
  const files = [file("src/app/page.tsx", ""), file("src/lib/solto.ts", "")];
  assert.deepEqual(findOrphanComponents(files).orphans, []);
});
