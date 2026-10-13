import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { findMembershipTenantId } from "@/lib/session-tenant";
import { getTenantContext } from "@/lib/supabase/tenant-context";

/**
 * O guard de módulo nos dois resolvedores de tenant (spec acesso-vendedora §1),
 * com o cliente real do Supabase contra um servidor de mentira (desenho de
 * `broadcast-deliveries.test.ts`): o Bearer vira usuário em `/auth/v1/user` e a
 * membership sai de `/rest/v1/memberships`.
 *
 * Mutante: tirar o `podeAcessar` de `getTenantContext` ou de
 * `findMembershipTenantId` derruba os testes da vendedora fora do mapa.
 */

const USUARIO = "6f0c7c2e-1d4b-4a8e-9b2f-3c5d7e9a1b20";
let membership: { tenant_id: string; role: string; modules: unknown } | null = null;
const leituras: URL[] = [];

const supabase = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/auth/v1/user") {
    res.end(
      JSON.stringify({
        id: USUARIO,
        aud: "authenticated",
        email: "vendedora@loja.test",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-07T12:00:00Z",
      }),
    );
    return;
  }
  if (url.pathname === "/rest/v1/memberships") {
    leituras.push(url);
    res.end(JSON.stringify(membership ? [membership] : []));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: `rota inesperada no teste: ${url.pathname}` }));
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-service-do-teste";
  process.env.SUPABASE_ANON_KEY = "chave-anon-do-teste";
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  membership = null;
  leituras.length = 0;
});

function pedido(method: string, caminho: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${caminho}`, {
    method,
    headers: { authorization: "Bearer token-do-teste", ...headers },
  });
}

async function recusa(promessa: Promise<unknown>): Promise<Response> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof Response) return erro;
    throw erro;
  }
  return assert.fail("esperava a Response de recusa");
}

test("getTenantContext lê role e modules e deixa o dono em qualquer rota", async () => {
  membership = { tenant_id: "loja-a", role: "owner", modules: [] };
  const ctx = await getTenantContext(pedido("GET", "/api/orders"));
  assert.equal(leituras[0]?.searchParams.get("select"), "tenant_id,role,modules");
  assert.deepEqual(
    { authUserId: ctx.authUserId, tenantId: ctx.tenantId, role: ctx.role, modules: ctx.modules },
    { authUserId: USUARIO, tenantId: "loja-a", role: "owner", modules: [] },
  );
});

test("getTenantContext barra a vendedora fora do mapa com 403 e a mensagem do contrato", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  for (const [metodo, caminho] of [["GET", "/api/orders"], ["DELETE", "/api/members"]] as const) {
    const resposta = await recusa(getTenantContext(pedido(metodo, caminho)));
    assert.equal(resposta.status, 403, `${metodo} ${caminho}`);
    assert.equal(await resposta.text(), MENSAGEM_BLOQUEIO);
  }
});

test("getTenantContext deixa a vendedora na base e nas vendas", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  assert.equal((await getTenantContext(pedido("GET", "/api/auth/me"))).role, "seller");
  assert.equal((await getTenantContext(pedido("POST", "/api/vendas"))).tenantId, "loja-a");
});

test("getTenantContext: postar liberado abre o GET de campanhas, não o POST; lixo em modules some", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: ["postar", "xpto"] };
  assert.deepEqual((await getTenantContext(pedido("GET", "/api/campanhas"))).modules, ["postar"]);
  assert.equal((await recusa(getTenantContext(pedido("POST", "/api/campanhas")))).status, 403);
});

test("getTenantContext sem membership: o 403 de sempre, não o de módulo", async () => {
  const resposta = await recusa(getTenantContext(pedido("GET", "/api/auth/me")));
  assert.equal(resposta.status, 403);
  assert.equal(await resposta.text(), "Tenant nao encontrado ou sem permissao.");
});

test("findMembershipTenantId devolve null para a vendedora fora do mapa", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  assert.equal(await findMembershipTenantId(USUARIO, pedido("GET", "/api/subscription")), null);
  assert.equal(leituras[0]?.searchParams.get("select"), "tenant_id,role,modules");
});

test("findMembershipTenantId: upload de mídia pelo cookie só com postar liberado", async () => {
  membership = { tenant_id: "loja-a", role: "seller", modules: ["postar"] };
  assert.equal(await findMembershipTenantId(USUARIO, pedido("POST", "/api/media/prepare")), "loja-a");
  membership = { tenant_id: "loja-a", role: "seller", modules: [] };
  assert.equal(await findMembershipTenantId(USUARIO, pedido("POST", "/api/media/prepare")), null);
});

test("findMembershipTenantId continua honrando x-tenant-id; dono passa", async () => {
  membership = { tenant_id: "loja-b", role: "owner", modules: [] };
  const tenantId = await findMembershipTenantId(
    USUARIO,
    pedido("GET", "/api/subscription", { "x-tenant-id": "loja-b" }),
  );
  assert.equal(tenantId, "loja-b");
  assert.equal(leituras[0]?.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(leituras[0]?.searchParams.get("user_id"), `eq.${USUARIO}`);
});
