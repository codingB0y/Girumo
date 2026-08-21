import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { findOrphanComponents, type SourceFile } from "./component-reachability";

/**
 * Gate: componente novo tem que chegar em alguma rota.
 *
 * Nasceu do #114 — botao de revogar convite existia, tinha teste, passava no
 * CI, e nenhuma pagina o importava. A feature simplesmente nao estava na tela.
 *
 * Os 10 abaixo ja estavam orfaos quando o gate entrou. Estao aqui para o gate
 * poder vigiar o que vem depois; cada um precisa de decisao propria (apagar ou
 * ligar numa rota), fora deste PR.
 */
const ORFAOS_CONHECIDOS: Record<string, string> = {
  "src/components/audit-log-panel.tsx": "Versao antiga: /admin/logs usa admin/logs-client.",
  "src/components/billing-panel.tsx": "Versao antiga: /admin/billing usa admin/stat-card.",
  "src/components/copy-link-button.tsx": "Tem teste e nenhum importador — mesmo padrao do #114.",
  "src/components/landing/v2/flow-canvas.tsx": "Sobra do redesign da landing v2.",
  "src/components/landing/v2/group-wall.tsx": "Sobra do redesign da landing v2.",
  "src/components/lp/method-accordion.tsx": "Sobra da /lp antiga.",
  "src/components/lp2/video-facade.tsx": "Duplicata: quem esta no ar e lp3/video-facade.",
  "src/components/ui/badge.tsx": "Cadeia orfa: so audit-log-panel e billing-panel usam.",
  "src/components/ui/card.tsx": "Cadeia orfa: so audit-log-panel e billing-panel usam.",
  "src/components/ui/skeleton.tsx": "Sem nenhum importador.",
};

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const IGNORED_DIRS = new Set([".next", "node_modules", "build", "dist", "coverage"]);

function readSourceTree(relativeRoot: string): SourceFile[] {
  const files: SourceFile[] = [];

  const walk = (absoluteDir: string) => {
    for (const entry of readdirSync(absoluteDir)) {
      if (IGNORED_DIRS.has(entry)) continue;
      const absolute = path.join(absoluteDir, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!/\.[cm]?tsx?$/.test(entry)) continue;
      files.push({
        path: path.relative(WEB_ROOT, absolute).split(path.sep).join("/"),
        content: readFileSync(absolute, "utf8"),
      });
    }
  };

  walk(path.join(WEB_ROOT, relativeRoot));
  return files;
}

const arquivos = readSourceTree("src");

test("a varredura enxerga a arvore de verdade", () => {
  assert.ok(arquivos.length > 100, `esperava a arvore inteira, li ${arquivos.length} arquivos`);
  assert.ok(arquivos.some((file) => file.path === "src/app/painel/page.tsx"));
});

test("todo componente chega em alguma rota", () => {
  const { orphans } = findOrphanComponents(arquivos, {
    allowlist: Object.keys(ORFAOS_CONHECIDOS),
  });

  assert.deepEqual(
    orphans,
    [],
    `Componente que nenhuma rota alcanca (existe, compila, e nao aparece na tela):\n` +
      orphans.map((file) => `  - ${file}`).join("\n") +
      `\n\nLigue numa rota ou, se for proposital, adicione em ORFAOS_CONHECIDOS com o motivo.`,
  );
});

test("a lista de orfaos conhecidos nao acumula entrada morta", () => {
  const { staleAllowlist } = findOrphanComponents(arquivos, {
    allowlist: Object.keys(ORFAOS_CONHECIDOS),
  });

  assert.deepEqual(
    staleAllowlist,
    [],
    `Entrada em ORFAOS_CONHECIDOS que ja nao e orfa (voltou para uma rota ou o arquivo sumiu). Remova:\n` +
      staleAllowlist.map((file) => `  - ${file}`).join("\n"),
  );
});
