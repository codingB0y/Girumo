import assert from "node:assert/strict";
import { test } from "node:test";

import { passouDoTetoYampi } from "./rota";

// Arquivo próprio: o balde em memória vive o processo do arquivo, e o de todas as lojas encheria o das rotas.

test("o teto de todas as lojas somadas segura a 21ª tentativa do minuto, mesmo vindo de lojas que não passaram do seu", async () => {
  for (let i = 0; i < 20; i += 1) assert.equal(await passouDoTetoYampi(`loja-teto-${i}`), null, String(i));
  const r = await passouDoTetoYampi("loja-teto-nova");
  assert.deepEqual([r?.status, await r?.json()], [429, { error: "Muitas tentativas. Aguarde 1 minuto." }]);
});
