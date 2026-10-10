import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { signSession } from "@/lib/auth";
import { accountIdFromSessionToken } from "@/lib/session";

/**
 * O caminho de cookie das rotas legadas (upload de mídia, ofertas, agendas,
 * links, disparo) passa por `getSessionAccountId`. Até 10/10/2026 ele só
 * conferia assinatura e prazo: um cookie revogado no logout seguia valendo
 * nessas rotas pelos 30 dias do `iat`, enquanto `getTenantContext` já recusava.
 */

let revokedBefore: string | null = null;

const supabase = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/rest/v1/session_revocations") {
      res.statusCode = 200;
      res.end(JSON.stringify(revokedBefore ? { revoked_before: revokedBefore } : null));
      return;
    }
    res.statusCode = 500;
    res.end(JSON.stringify({ message: `inesperado: ${url.pathname}` }));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  supabase.close();
});

test("cookie válido e não revogado devolve o usuário", async () => {
  revokedBefore = null;
  const token = await signSession("usuario-1");
  assert.equal(await accountIdFromSessionToken(token), "usuario-1");
});

test("cookie emitido antes da revogação é recusado", async () => {
  const token = await signSession("usuario-1");
  revokedBefore = new Date(Date.now() + 1000).toISOString();
  assert.equal(await accountIdFromSessionToken(token), null);
});

test("cookie emitido depois da revogação volta a valer", async () => {
  revokedBefore = new Date(Date.now() - 60_000).toISOString();
  const token = await signSession("usuario-1");
  assert.equal(await accountIdFromSessionToken(token), "usuario-1");
});

test("cookie ausente ou adulterado é recusado", async () => {
  assert.equal(await accountIdFromSessionToken(undefined), null);
  assert.equal(await accountIdFromSessionToken("payload.assinatura-falsa"), null);
});
