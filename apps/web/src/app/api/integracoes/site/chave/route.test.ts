import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

/** Dono logado por Bearer (mesmo molde de api/orders/route.test.ts). */

const LINK = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
type Chamada = { metodo: string; url: URL; corpo: unknown };
const chamadas: Chamada[] = [];
let papel = "owner";
let linkDaLoja = true;

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    chamadas.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : undefined });
    const chave = `${req.method} ${url.pathname}`;
    let status = 500;
    let corpo: unknown = { message: `inesperado: ${chave}` };
    if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
    else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel }]];
    else if (chave === "GET /rest/v1/tracked_links") [status, corpo] = [200, linkDaLoja ? [{ id: LINK, tenant_id: "loja-b", slug: "vip-atacado" }] : []];
    else if (chave === "POST /rest/v1/site_integrations") [status, corpo] = [201, []];
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
});
after(() => { supabase.close(); });

function pedir(corpo: unknown): Request {
  return new Request("http://girumo.test/api/integracoes/site/chave", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

test("dono gera chave: 201, mostra a chave uma vez e grava só o hash", async () => {
  chamadas.length = 0;
  papel = "owner";
  linkDaLoja = true;
  const resposta = await POST(pedir({ tracked_link_id: LINK }));
  assert.equal(resposta.status, 201);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();
  assert.match(corpo.chave, /^gk_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(corpo.key_last4, corpo.chave.slice(-4));
  assert.deepEqual(corpo.link, { id: LINK, slug: "vip-atacado" });

  const upsert = chamadas.find((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/site_integrations");
  const gravado = upsert?.corpo as Record<string, unknown>;
  assert.equal(gravado.tenant_id, "loja-b");
  assert.equal(gravado.key_hash, createHash("sha256").update(corpo.chave).digest("hex"));
  assert.ok(!JSON.stringify(gravado).includes(corpo.chave));
});

test("operador e vendedora não geram chave (403) e nada é gravado", async () => {
  for (const p of ["operator", "seller"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await POST(pedir({ tracked_link_id: LINK }))).status, 403);
    assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/site_integrations").length, 0);
  }
});

test("link de outra loja: 404; corpo inválido: 400", async () => {
  papel = "owner";
  linkDaLoja = false;
  assert.equal((await POST(pedir({ tracked_link_id: LINK }))).status, 404);
  linkDaLoja = true;
  assert.equal((await POST(pedir({ tracked_link_id: "nao-e-uuid" }))).status, 400);
  assert.equal((await POST(pedir({}))).status, 400);
});
