// apps/web/src/lib/integracoes/redirect-do-cadastro.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { redirectDoCadastro } from "./redirect-do-cadastro";

const CID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

test("sem domínio próprio: host do app com /r/<slug>?cid=", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.girumo.com.br/";
  assert.equal(
    redirectDoCadastro({ dominioAtivo: null, slug: "vip-atacado", captureId: CID }),
    `https://app.girumo.com.br/r/vip-atacado?cid=${CID}`,
  );
});

test("domínio próprio ativo: link na raiz do domínio da loja", () => {
  assert.equal(
    redirectDoCadastro({ dominioAtivo: "links.modakidsdosul.com.br", slug: "vip-atacado", captureId: CID }),
    `https://links.modakidsdosul.com.br/vip-atacado?cid=${CID}`,
  );
});
