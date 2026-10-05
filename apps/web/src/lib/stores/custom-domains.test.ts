import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { claimCustomDomain, getActiveDomainTenant, getCustomDomain, saveVerification } from "./custom-domains";

// PostgREST falso: o supabase-js real roda e só a rede é trocada.
type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: [] };

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (pedaco) => {
    bruto += pedaco;
  });
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "GET",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    });
    res.statusCode = resposta.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resposta.corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  pedidos.length = 0;
});

const LINHA = {
  tenant_id: "loja-a",
  hostname: "links.loja.com.br",
  verification_token: "tok",
  status: "pending",
  last_error: null,
  checked_at: null,
  verified_at: null,
};

function filtros(url: URL): Record<string, string> {
  return Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));
}

test("lê o domínio da conta filtrando pelo tenant", async () => {
  resposta = { status: 200, corpo: [LINHA] };
  const d = await getCustomDomain("loja-a");
  assert.equal(d?.hostname, "links.loja.com.br");
  assert.equal(d?.verificationToken, "tok");
  assert.equal(pedidos[0].url.pathname, "/rest/v1/custom_domains");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
});

test("dono do host: só linha ativa, filtrando pelo host", async () => {
  resposta = { status: 200, corpo: [{ tenant_id: "loja-a" }] };
  assert.equal(await getActiveDomainTenant("links.loja.com.br"), "loja-a");
  assert.deepEqual(filtros(pedidos[0].url), { hostname: "eq.links.loja.com.br", status: "eq.active" });
});

test("host desconhecido ou pendente: null", async () => {
  resposta = { status: 200, corpo: [] };
  assert.equal(await getActiveDomainTenant("x.loja.com.br"), null);
});

test("cadastro grava pendente com o token", async () => {
  resposta = { status: 201, corpo: LINHA };
  assert.deepEqual(await claimCustomDomain("loja-a", "links.loja.com.br", "tok"), {
    ok: true,
    domain: {
      tenantId: "loja-a",
      hostname: "links.loja.com.br",
      verificationToken: "tok",
      status: "pending",
      lastError: null,
      checkedAt: null,
      verifiedAt: null,
    },
  });
  assert.equal(pedidos[0].metodo, "POST");
  assert.deepEqual(pedidos[0].corpo, {
    tenant_id: "loja-a",
    hostname: "links.loja.com.br",
    verification_token: "tok",
    status: "pending",
  });
});

test("segundo domínio na mesma conta: exists", async () => {
  resposta = {
    status: 409,
    corpo: { code: "23505", message: 'duplicate key value violates unique constraint "custom_domains_tenant_unique"', details: null, hint: null },
  };
  assert.deepEqual(await claimCustomDomain("loja-a", "outro.loja.com.br", "tok"), { ok: false, reason: "exists" });
});

test("ativar host já ativo em outra conta: taken, com filtro de tenant e só linha pendente no update", async () => {
  resposta = {
    status: 409,
    corpo: { code: "23505", message: 'duplicate key value violates unique constraint "custom_domains_hostname_ativo"', details: null, hint: null },
  };
  assert.deepEqual(await saveVerification("loja-a", { status: "active", lastError: null }), { ok: false, reason: "taken" });
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", status: "eq.pending" });
});

test("verificação pendente grava o problema e não marca verified_at", async () => {
  resposta = { status: 200, corpo: [{ ...LINHA, last_error: "txt", checked_at: "2026-10-04T12:00:00.000Z" }] };
  const r = await saveVerification("loja-a", { status: "pending", lastError: "txt" });
  assert.equal(r.ok, true);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.status, "pending");
  assert.equal(corpo.last_error, "txt");
  assert.equal(corpo.verified_at, null);
  assert.equal(typeof corpo.checked_at, "string");
  // Verificar só promove: nunca rebaixa uma linha que outra verificação ativou.
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", status: "eq.pending" });
});

test("ativação marca verified_at", async () => {
  resposta = { status: 200, corpo: [{ ...LINHA, status: "active", verified_at: "2026-10-04T12:00:00.000Z" }] };
  const r = await saveVerification("loja-a", { status: "active", lastError: null });
  assert.equal(r.ok && r.domain.status, "active");
  assert.equal(typeof (pedidos[0].corpo as Record<string, unknown>).verified_at, "string");
});

test("domínio apagado no meio da verificação: gone", async () => {
  resposta = { status: 200, corpo: [] };
  assert.deepEqual(await saveVerification("loja-a", { status: "pending", lastError: "txt" }), { ok: false, reason: "gone" });
});
