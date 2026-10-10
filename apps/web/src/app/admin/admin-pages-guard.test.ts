import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

/**
 * O `requireAdmin()` do `admin/layout.tsx` NÃO basta: por Partial Rendering o
 * layout não re-renderiza na navegação entre páginas irmãs, e um request RSC
 * que declara o layout como já montado recebe só o segmento da página. As
 * páginas leem com service-role, então cada uma confere o admin sozinha, antes
 * de qualquer leitura. Página nova sob `/admin` sem o guard reprova aqui.
 */

const ADMIN_DIR = join(process.cwd(), "src", "app", "admin");

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

test("toda página do admin chama requireAdmin() como primeira instrução", () => {
  const found = pages(ADMIN_DIR);
  assert.ok(found.length >= 13, `esperava as páginas do admin, achei ${found.length}`);

  const semGuard = found.filter((file) => {
    const source = readFileSync(file, "utf8");
    const body = source.match(/export default async function \w+\([^)]*\)[^{]*\{\s*([^\n]*)/);
    return body?.[1]?.trim() !== "await requireAdmin();";
  });

  assert.deepEqual(
    semGuard.map((file) => relative(ADMIN_DIR, file)),
    [],
    "página do admin sem `await requireAdmin();` na primeira linha",
  );
});
