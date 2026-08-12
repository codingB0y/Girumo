import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Todo evento declarado precisa de alguém que o emita.
 *
 * Quatro eventos (`first_group_synced`, `first_schedule`, `referral_sent` e o já
 * removido `trial_started`) viveram no tipo desde o começo sem nenhum call-site.
 * O funil do admin desenhava a etapa "Grupo Sincronizado" e ela ficava zerada
 * para sempre — parecia que ninguém sincronizava grupo, quando na verdade
 * ninguém registrava. Um tipo sozinho não prova que o dado existe.
 *
 * Este teste lê o código-fonte de propósito: a asserção é sobre o call-site, e
 * nenhum type-check pega a ausência dele.
 */

const SRC = join(import.meta.dirname, "..", "..");
const SUMMARY = join(import.meta.dirname, "funnel-summary.ts");

function declaredEvents(): string[] {
  const src = readFileSync(SUMMARY, "utf8");
  const block = src.match(/export type FunnelEvent =([\s\S]*?);/);
  assert.ok(block, "não achei a declaração de FunnelEvent");
  // Só as alternativas do union: ignora comentários abaixo do `;`.
  return [...block[1].matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

test("every declared funnel event has at least one emitter in the codebase", () => {
  const events = declaredEvents();
  assert.ok(events.length >= 10, `esperava o union cheio, achei ${events.length}`);

  const corpus = sourceFiles(SRC)
    .filter((f) => !f.endsWith("funnel-summary.ts"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const orphans = events.filter((e) => !corpus.includes(`event: "${e}"`));
  assert.deepEqual(
    orphans,
    [],
    `Evento(s) declarado(s) sem nenhum trackFunnelEvent que os emita: ${orphans.join(", ")}. ` +
      `Ou instrumente o call-site, ou remova do union — etapa sem emissor aparece zerada no funil do admin.`,
  );
});

test("trial_started stays out: the current offer has no trial", () => {
  assert.ok(
    !declaredEvents().includes("trial_started"),
    "trial_started voltou ao union — só re-adicione junto com um produto de trial e o call-site que o emite",
  );
});
