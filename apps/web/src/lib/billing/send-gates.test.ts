import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Os dois tetos que um envio de campanha tem que respeitar andam juntos.
 *
 * Existem DOIS caminhos de envio — `/api/broadcasts` e
 * `/api/campanhas/[slug]/messages`. Um teto que valesse so num deles nao seria
 * um teto: seria uma tela que o cliente troca para contornar. Foi assim que
 * `campaigns:send` viveu por um tempo, e nada no type-check acusa.
 *
 * Le o codigo-fonte de proposito, mesmo padrao de `funnel-emitters.test.ts`: a
 * assercao e sobre o call-site. A regra e por FORMA — quem cobra `campaigns:send`
 * cobra `contacts:reach` —, entao um terceiro caminho de envio e pego sozinho.
 */

const API = join(import.meta.dirname, "..", "..", "app", "api");

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) arquivos(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

test("todo caminho de envio cobra o teto de contatos junto com o de campanhas", () => {
  const envios = arquivos(API).filter((f) =>
    readFileSync(f, "utf8").replace(/\s+/g, "").includes('assertPlanLimit(tenantId,"campaigns:send")'),
  );

  assert.ok(envios.length >= 2, `esperava os dois caminhos de envio, achei ${envios.length}`);

  for (const rota of envios) {
    const src = readFileSync(rota, "utf8").replace(/\s+/g, "");
    assert.ok(
      src.includes('assertPlanLimit(tenantId,"contacts:reach")'),
      `${rota} envia sem cobrar o teto de contatos — o teto vira opcional por tela`,
    );
  }
});

/**
 * O teto de contatos NAO pode ser cobrado na ingestao de lead.
 *
 * Quem chama `POST /api/leads` e o engine, quando alguem entra num grupo. A
 * pessoa entra de qualquer jeito — o WhatsApp nao consulta plano —, entao
 * barrar ali nao impede nada: so descarta o registro de que ela entrou. Seria
 * perda silenciosa do dado do proprio lojista, sem nada que ele pudesse fazer
 * depois do fato, e sem sequer aparecer para ele.
 */
test("a ingestao de lead nao e ponto de cobranca de teto", () => {
  const src = readFileSync(join(API, "leads", "route.ts"), "utf8").replace(/\s+/g, "");
  assert.ok(
    !src.includes('"contacts:reach"'),
    "cobrar teto na ingestao descarta quem ja entrou no grupo; o teto e no alcance",
  );
});
