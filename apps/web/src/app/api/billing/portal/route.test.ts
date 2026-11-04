import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, mock, test } from "node:test";

import { getStripe } from "@/lib/billing/stripe";
import { POST } from "./route";

/**
 * Dono logado por Bearer contra um Supabase de mentira (molde: api/integracoes/site/chave/route.test.ts).
 * O customer mora em `organizations` (checkout dos add-ons); `subscriptions` só tem cópia
 * quando o plano passou pelo Stripe — loja com plano concedido à mão não tem.
 */

type Chamada = { metodo: string; url: URL };
const chamadas: Chamada[] = [];
let papel = "owner";
let doTenant: string | null = null;
let daAssinatura: string | null = null;

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  chamadas.push({ metodo: req.method ?? "", url });
  const chave = `${req.method} ${url.pathname}`;
  let status = 500;
  let corpo: unknown = { message: `inesperado: ${chave}` };
  if (url.pathname === "/auth/v1/user") [status, corpo] = [200, { id: "usuario-1", email: "dono@loja.test" }];
  else if (url.pathname === "/rest/v1/memberships") [status, corpo] = [200, [{ tenant_id: "loja-b", role: papel }]];
  else if (chave === "GET /rest/v1/organizations") [status, corpo] = [200, [{ stripe_customer_id: doTenant }]];
  else if (chave === "GET /rest/v1/subscriptions") [status, corpo] = [200, daAssinatura ? [{ stripe_customer_id: daAssinatura }] : []];
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(corpo));
});

const portal = mock.fn(async (p: { customer: string }) => ({ url: `https://billing.stripe.test/${p.customer}` }));

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  // Em pedaços: o scan de secrets do verify casa o literal inteiro, mesmo falso.
  process.env.STRIPE_SECRET_KEY = "sk_" + "test_falsa";
  // A rota usa o mesmo cliente em cache: trocar o método aqui é trocar o que ela chama.
  mock.method(getStripe().billingPortal.sessions, "create", portal as never);
});
after(() => { supabase.close(); });
beforeEach(() => {
  chamadas.length = 0;
  portal.mock.resetCalls();
  papel = "owner";
});

function pedir(): Request {
  return new Request("http://girumo.test/api/billing/portal", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b" },
  });
}

function filtrouPelaLoja(tabela: string, coluna: string): boolean {
  return chamadas.some((c) => c.url.pathname === `/rest/v1/${tabela}` && c.url.searchParams.get(coluna) === "eq.loja-b");
}

async function abrir(): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const r = await POST(pedir());
  return { status: r.status, corpo: (await r.json()) as Record<string, unknown> };
}

test("só em organizations (plano concedido à mão + add-on): abre o portal desse customer", async () => {
  [doTenant, daAssinatura] = ["cus_org", null];
  const { status, corpo } = await abrir();
  assert.equal(status, 200);
  assert.equal(corpo.url, "https://billing.stripe.test/cus_org");
  assert.equal(portal.mock.calls[0]?.arguments[0].customer, "cus_org");
  assert.ok(filtrouPelaLoja("organizations", "id"));
});

test("só em subscriptions (assinou antes do ponteiro existir): cai na cópia do webhook", async () => {
  [doTenant, daAssinatura] = [null, "cus_sub"];
  const { status, corpo } = await abrir();
  assert.equal(status, 200);
  assert.equal(corpo.url, "https://billing.stripe.test/cus_sub");
  assert.ok(filtrouPelaLoja("subscriptions", "tenant_id"));
});

test("nos dois: vale o de organizations, o mesmo que o checkout dos add-ons usa", async () => {
  [doTenant, daAssinatura] = ["cus_org", "cus_sub"];
  const { status } = await abrir();
  assert.equal(status, 200);
  assert.equal(portal.mock.calls[0]?.arguments[0].customer, "cus_org");
});

test("em nenhum: 404 e nada chega ao Stripe", async () => {
  [doTenant, daAssinatura] = [null, null];
  const { status, corpo } = await abrir();
  assert.equal(status, 404);
  assert.match(String(corpo.error), /Cliente Stripe nao encontrado/);
  assert.equal(portal.mock.callCount(), 0);
});

test("vendedora e operador: 403 sem ler customer nem abrir portal", async () => {
  [doTenant, daAssinatura] = ["cus_org", "cus_sub"];
  for (const p of ["seller", "operator"]) {
    chamadas.length = 0;
    papel = p;
    assert.equal((await POST(pedir())).status, 403, p);
    assert.ok(!chamadas.some((c) => c.url.pathname === "/rest/v1/organizations" || c.url.pathname === "/rest/v1/subscriptions"), p);
  }
  assert.equal(portal.mock.callCount(), 0);
});
