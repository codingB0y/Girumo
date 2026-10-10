import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ROTAS } from "./modulos";

/**
 * Estrutural 2 do acesso da vendedora (spec §1): cada padrão do mapa casa com um
 * `route.ts` real que exporta cada método liberado. Um typo no mapa deixaria o
 * módulo mudo — a vendedora com 403 numa tela que devia funcionar — sem ninguém ver.
 */

/** apps/web/src/app — este arquivo mora em src/lib/auth. */
const APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");

/**
 * Rotas do mapa que ainda não existem: nascem no PR 4 (`feat/vendas-api`).
 * O PR 4 esvazia esta lista — o teste falha se uma delas já existir.
 */
const PENDENTES_DO_PR_4: ReadonlySet<string> = new Set(["/api/vendas", "/api/vendas/contato", "/api/vendas/*"]);

/** Pastas que o padrão alcança. `*` desce em qualquer segmento dinâmico `[x]` (não catch-all). */
function pastas(padrao: string): string[] {
  let atuais = [APP];
  for (const parte of padrao.split("/").filter(Boolean)) {
    atuais = atuais.flatMap((pasta) => {
      if (parte !== "*") return existsSync(join(pasta, parte)) ? [join(pasta, parte)] : [];
      return readdirSync(pasta, { withFileTypes: true })
        .filter((item) => item.isDirectory() && /^\[[^.\]]+\]$/.test(item.name))
        .map((item) => join(pasta, item.name));
    });
  }
  return atuais;
}

function rotasDoPadrao(padrao: string): string[] {
  return pastas(padrao)
    .map((pasta) => join(pasta, "route.ts"))
    .filter((arquivo) => existsSync(arquivo));
}

function exporta(arquivo: string, metodo: string): boolean {
  const fonte = readFileSync(arquivo, "utf8");
  return new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${metodo}\\b`).test(fonte);
}

const ENTRADAS = Object.values(ROTAS).flat();

test("cada padrão do mapa tem route.ts que exporta cada método liberado", () => {
  for (const { padrao, metodos } of ENTRADAS) {
    if (PENDENTES_DO_PR_4.has(padrao)) continue;
    const arquivos = rotasDoPadrao(padrao);
    assert.ok(arquivos.length > 0, `${padrao}: nenhum route.ts em src/app${padrao}`);
    for (const metodo of metodos) {
      assert.ok(
        arquivos.some((arquivo) => exporta(arquivo, metodo)),
        `${metodo} ${padrao}: o route.ts não exporta ${metodo}`,
      );
    }
  }
});

test("pendente do PR 4 continua no mapa e ainda não existe", () => {
  for (const padrao of PENDENTES_DO_PR_4) {
    assert.ok(ENTRADAS.some((e) => e.padrao === padrao), `${padrao} saiu do mapa: tire de PENDENTES_DO_PR_4`);
    assert.deepEqual(
      rotasDoPadrao(padrao),
      [],
      `${padrao} já existe: tire de PENDENTES_DO_PR_4 para o teste conferir os métodos`,
    );
  }
});
