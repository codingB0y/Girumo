/**
 * Alcancabilidade de componentes a partir das rotas.
 *
 * O #114 mostrou que "existe + tem teste + CI verde" nao significa "esta na
 * tela": o botao de revogar convite era um componente que nenhuma pagina
 * importava. Nem lint nem teste unitario pegam isso, porque o arquivo compila e
 * o teste importa o componente diretamente.
 *
 * Aqui o grafo de imports e percorrido a partir das RAIZES do Next (page,
 * layout, route...). Arquivo de teste de proposito nao conta como raiz — era
 * justamente o teste que dava a falsa sensacao de cobertura.
 */

export type SourceFile = {
  /** Caminho relativo a apps/web, com barra normal. Ex.: "src/components/x.tsx" */
  path: string;
  content: string;
};

/** Arquivos especiais que o Next carrega sozinho — o resto so entra por import. */
const NEXT_ENTRY_FILES = new Set([
  "page.tsx",
  "layout.tsx",
  "template.tsx",
  "error.tsx",
  "global-error.tsx",
  "not-found.tsx",
  "loading.tsx",
  "default.tsx",
  "route.ts",
  "sitemap.ts",
  "robots.ts",
  "opengraph-image.tsx",
  "twitter-image.tsx",
  "icon.tsx",
  "apple-icon.tsx",
  "manifest.ts",
]);

/** Entradas fora de src/app que o runtime tambem carrega sozinho. */
const STANDALONE_ENTRIES = new Set([
  "src/middleware.ts",
  "src/instrumentation.ts",
  "middleware.ts",
  "instrumentation.ts",
]);

const RESOLUTION_SUFFIXES = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

/**
 * Captura `from "x"`, `import "x"` e `import("x")` — este ultimo cobre
 * next/dynamic, que e como varios paineis carregam componente pesado.
 */
const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

function isTestFile(path: string): boolean {
  return /\.(?:test|spec)\.[cm]?tsx?$/.test(path);
}

export function isEntryPoint(path: string): boolean {
  if (isTestFile(path)) return false;
  if (STANDALONE_ENTRIES.has(path)) return true;
  if (!path.startsWith("src/app/")) return false;
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  return NEXT_ENTRY_FILES.has(fileName);
}

/** Resolve "./x", "../x" e o alias "@/x" para um caminho relativo a apps/web. */
function resolveSpecifier(fromPath: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (!specifier.startsWith(".")) return null; // pacote de node_modules

  const fromDir = fromPath.slice(0, fromPath.lastIndexOf("/"));
  const segments = `${fromDir}/${specifier}`.split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

export function extractImports(file: SourceFile): string[] {
  const found: string[] = [];
  for (const match of file.content.matchAll(IMPORT_PATTERN)) {
    const resolved = resolveSpecifier(file.path, match[1]);
    if (resolved) found.push(resolved);
  }
  return found;
}

/**
 * Percorre o grafo a partir das raizes e devolve todo arquivo alcancado.
 * Cicloe entre modulos nao trava: o visitado e marcado antes de descer.
 */
export function collectReachable(files: SourceFile[]): Set<string> {
  const byPath = new Map(files.map((file) => [file.path, file]));

  const resolve = (candidate: string): string | null => {
    for (const suffix of RESOLUTION_SUFFIXES) {
      const attempt = `${candidate}${suffix}`;
      if (byPath.has(attempt)) return attempt;
    }
    return null;
  };

  const reachable = new Set<string>();
  const queue = files.filter((file) => isEntryPoint(file.path)).map((file) => file.path);
  for (const path of queue) reachable.add(path);

  while (queue.length > 0) {
    const current = queue.pop() as string;
    const file = byPath.get(current);
    if (!file) continue;

    for (const target of extractImports(file)) {
      const resolved = resolve(target);
      if (!resolved || reachable.has(resolved)) continue;
      reachable.add(resolved);
      queue.push(resolved);
    }
  }

  return reachable;
}

export type OrphanOptions = {
  /** Prefixo dos arquivos vigiados. Fora dele, nada e cobrado. */
  watchedPrefix?: string;
  /** Componentes que ficam fora da tela de proposito (fixture, preview, WIP). */
  allowlist?: readonly string[];
};

/**
 * Componentes sob `watchedPrefix` que nenhuma rota alcanca, em ordem estavel.
 * Entrada da allowlist que ja voltou a ser usada tambem e reportada, para a
 * lista nao virar cemiterio.
 */
export function findOrphanComponents(
  files: SourceFile[],
  options: OrphanOptions = {},
): { orphans: string[]; staleAllowlist: string[] } {
  const watchedPrefix = options.watchedPrefix ?? "src/components/";
  const allowlist = new Set(options.allowlist ?? []);
  const reachable = collectReachable(files);

  const watched = files
    .filter((file) => file.path.startsWith(watchedPrefix))
    .filter((file) => file.path.endsWith(".tsx"))
    .filter((file) => !isTestFile(file.path))
    .map((file) => file.path);

  const orphans = watched
    .filter((path) => !reachable.has(path) && !allowlist.has(path))
    .sort();

  const staleAllowlist = [...allowlist]
    .filter((path) => reachable.has(path) || !watched.includes(path))
    .sort();

  return { orphans, staleAllowlist };
}
