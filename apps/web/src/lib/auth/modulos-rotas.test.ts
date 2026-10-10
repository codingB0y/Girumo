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

// `/api/vendas/*` (PATCH, DELETE) também casa a pasta estática `contato`, que o Next
// serve antes do `[id]`: ela não pode exportar os métodos do curinga, senão a vendedora
// editaria/apagaria "contato" em vez de levar 405.
test("a pasta estática vendas/contato não exporta os métodos do curinga /api/vendas/*", () => {
  const contato = join(APP, "api", "vendas", "contato", "route.ts");
  for (const metodo of ["PATCH", "DELETE"]) {
    assert.equal(exporta(contato, metodo), false, `contato/route.ts exporta ${metodo}`);
  }
});
