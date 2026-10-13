// apps/web/src/app/api/integracoes/site/teste/route.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { POST } from "./route";

const LINK = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const CID_ZERO = "00000000-0000-0000-0000-000000000000";
type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];
let papel = "owner";
let integrada = true;
let dominio: "active" | "pending" | null = null;

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  chamadas.push({ metodo: req.method ?? "", url });
  const chave = `${req.method} ${url.pathname}`;
  let status = 200;
  let corpo: unknown = [];
  if (url.pathname === "/auth/v1/user") corpo = { id: "usuario-1", email: "dono@loja.test" };
  else if (url.pathname === "/rest/v1/memberships") corpo = [{ tenant_id: "loja-b", role: papel }];
  else if (chave === "GET /rest/v1/site_integrations")
    corpo = integrada ? [{ tenant_id: "loja-b", key_last4: "7f2a", tracked_link_id: LINK, created_at: "t", rotated_at: null, last_used_at: null }] : [];
  else if (chave === "GET /rest/v1/tracked_links")
    corpo = [{ id: LINK, tenant_id: "loja-b", slug: "vip-atacado", campaign_group_id: null, target_url: "x", clicks: 0, metadata: {}, created_at: "t", updated_at: "t" }];
  else if (chave === "GET /rest/v1/custom_domains")
    corpo = dominio
      ? [{ tenant_id: "loja-b", hostname: "links.loja.com.br", verification_token: "v", status: dominio, last_error: null, checked_at: null, verified_at: null }]
      : [];
  else [status, corpo] = [500, { message: `inesperado: ${chave}` }];
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(corpo));
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.girumo.com.br";
});
after(() => { supabase.close(); });

function pedir(): Request {
  return new Request("http://girumo.test/api/integracoes/site/teste", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

function reiniciar(over: { papel?: string; integrada?: boolean; dominio?: "active" | "pending" | null } = {}): void {
  chamadas.length = 0;
  papel = over.papel ?? "owner";
  integrada = over.integrada ?? true;
  dominio = over.dominio ?? null;
}

test("dono testa: vê o que o site mandaria e a resposta, e nada é gravado", async () => {
  reiniciar();
  const resposta = await POST(pedir());
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  const corpo = await resposta.json();
  assert.equal(corpo.gravado, false);
  assert.equal(corpo.enviado.whatsapp, "62999998888");
  assert.match(corpo.enviado.page_url, /utm_campaign=/);
  assert.match(corpo.enviado.event_id, /^[A-Za-z0-9_-]{8,100}$/);
  assert.equal(corpo.resposta.status, 201);
  assert.deepEqual(corpo.resposta.corpo, {
    redirect: `https://app.girumo.com.br/r/vip-atacado?cid=${CID_ZERO}`,
    capture_id: CID_ZERO,
  });
  // Ensaio: só leitura. Nenhum cadastro, nenhum clique, nenhuma escrita.
  for (const c of chamadas) assert.equal(c.metodo, "GET", `${c.metodo} ${c.url.pathname}`);
  assert.ok(!chamadas.some((c) => c.url.pathname === "/rest/v1/site_captures"));
  for (const c of chamadas.filter((x) => x.url.pathname.startsWith("/rest/v1/") && x.url.pathname !== "/rest/v1/memberships")) {
    assert.equal(c.url.searchParams.get("tenant_id"), "eq.loja-b", c.url.pathname);
  }
});

test("domínio próprio ativo sai no redirect; pendente não", async () => {
  reiniciar({ dominio: "active" });
  const ativo = await (await POST(pedir())).json();
  assert.equal(ativo.resposta.corpo.redirect, `https://links.loja.com.br/vip-atacado?cid=${CID_ZERO}`);
  reiniciar({ dominio: "pending" });
  const pendente = await (await POST(pedir())).json();
  assert.equal(pendente.resposta.corpo.redirect, `https://app.girumo.com.br/r/vip-atacado?cid=${CID_ZERO}`);
});

test("sem chave: 409 pedindo para gerar antes", async () => {
  reiniciar({ integrada: false });
  const resposta = await POST(pedir());
  assert.equal(resposta.status, 409);
  assert.match((await resposta.json()).error, /Gere a chave/);
});

test("operador e vendedora: 403 sem ler a integração", async () => {
  for (const p of ["operator", "seller"]) {
    reiniciar({ papel: p });
    assert.equal((await POST(pedir())).status, 403);
    assert.ok(!chamadas.some((c) => c.url.pathname === "/rest/v1/site_integrations"), p);
  }
});
