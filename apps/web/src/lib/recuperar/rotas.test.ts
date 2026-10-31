import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { POST as CheckoutPost } from "@/app/api/billing/recuperar/checkout/route";
import type { GET as OfertaGet } from "@/app/api/billing/recuperar/oferta/route";
import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";

/**
 * As rotas do Recuperar de ponta a ponta: o handler real, o getTenantContext real
 * (com o guard de módulo) e o cliente real do Supabase, falando com um GoTrue e um
 * PostgREST de mentira no mesmo servidor — só a rede é trocada (padrão de
 * `app/api/vendas/routes.test.ts`). O token Bearer escolhe quem chama; a membership
 * volta com a loja, o papel e os módulos dessa pessoa. Nenhum caso chega ao Stripe.
 */

const LOJA = "0b7c9a52-3d1e-4f6a-9c2b-5e8d7f1a2b3c";

/** Cada token é uma pessoa. */
const USERS: Record<string, { id: string; tenant: string; role: string; modules: string[] }> = {
  "token-dono": { id: "7e2d4c6b-1a3f-4b5e-8c7d-9f0a1b2c3d4e", tenant: LOJA, role: "owner", modules: [] },
  "token-admin": { id: "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b", tenant: LOJA, role: "admin", modules: [] },
  "token-operador": { id: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", tenant: LOJA, role: "operator", modules: [] },
  "token-vendedora": { id: "5a1f0c3e-8b2d-4e7f-9a6c-1d3e5f7a9b0c", tenant: LOJA, role: "seller", modules: [] },
  "token-vendedora-recuperar": { id: "3b5d7f9a-1c2e-4a4b-8d6f-0a2c4e6a8b1d", tenant: LOJA, role: "seller", modules: ["recuperar"] },
};

type Visto = { method: string; url: URL; prefer: string; body: unknown };
type Resposta = { status: number; body?: unknown };

/** Tudo que chegou ao PostgREST (GoTrue e memberships ficam de fora). */
const vistos: Visto[] = [];
let banco: (pedido: Visto) => Resposta = () => ({ status: 500, body: { message: "sem resposta" } });

/** O estado do banco falso, ajustado por caso. */
let ligado = false;
let plano: string | null = null;

/** GoTrue e memberships respondem pelo token; o resto é do banco falso (e fica em `vistos`). */
function responder(req: IncomingMessage, pedido: Visto): Resposta {
  if (pedido.url.pathname === "/auth/v1/user") {
    const token = String(req.headers.authorization ?? "").replace(/^Bearer /i, "");
    const usuario = USERS[token];
    return usuario
      ? { status: 200, body: { id: usuario.id, email: `${token}@loja.test`, aud: "authenticated", role: "authenticated" } }
      : { status: 401, body: { message: "invalid JWT" } };
  }
  if (pedido.url.pathname === "/rest/v1/memberships") {
    const userId = pedido.url.searchParams.get("user_id")?.replace(/^eq\./, "");
    const usuario = Object.values(USERS).find((candidato) => candidato.id === userId);
    return { status: 200, body: usuario ? [{ tenant_id: usuario.tenant, role: usuario.role, modules: usuario.modules }] : [] };
  }
  vistos.push(pedido);
  return banco(pedido);
}

const servidor = createServer((req, res) => {
  let texto = "";
  req.on("data", (pedaco) => (texto += pedaco));
  req.on("end", () => {
    const pedido: Visto = {
      method: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      prefer: String(req.headers.prefer ?? ""),
      body: texto ? JSON.parse(texto) : undefined,
    };
    const { status, body } = responder(req, pedido);
    // `.single()`/`.maybeSingle()` fora de GET pedem um objeto, não a lista.
    const unico = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const corpo = unico && Array.isArray(body) ? body[0] : body;
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let oferta: typeof OfertaGet;
let checkout: typeof CheckoutPost;
const precoAntes = process.env.STRIPE_PRICE_RECUPERAR;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-do-gotrue-falso";
  ({ GET: oferta } = await import("@/app/api/billing/recuperar/oferta/route"));
  ({ POST: checkout } = await import("@/app/api/billing/recuperar/checkout/route"));
});

after(() => {
  servidor.close();
  if (precoAntes === undefined) delete process.env.STRIPE_PRICE_RECUPERAR;
  else process.env.STRIPE_PRICE_RECUPERAR = precoAntes;
});

beforeEach(() => {
  vistos.length = 0;
  ligado = false;
  plano = null;
  delete process.env.STRIPE_PRICE_RECUPERAR;
  banco = ({ url }) => {
    if (url.pathname === "/rest/v1/tenant_settings") return { status: 200, body: [{ recuperar_enabled: ligado }] };
    if (url.pathname === "/rest/v1/subscriptions") return { status: 200, body: plano ? [{ status: plano }] : [] };
    if (url.pathname === "/rest/v1/logs") return { status: 201 };
    return { status: 500, body: { message: "sem resposta" } };
  };
});

function chamar(metodo: string, caminho: string, token: string | null, corpo?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${caminho}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

const pedidosA = (caminho: string) => vistos.filter((pedido) => pedido.url.pathname === caminho);

const OFERTA = "/api/billing/recuperar/oferta";
const CHECKOUT = "/api/billing/recuperar/checkout";
const AVISO_FALTANDO = { error: "Confirme o aviso de privacidade para ativar." };

/** A confirmação do aviso só é registrada quando a cobrança vai seguir. */
const semRegistroDeAviso = () => assert.equal(pedidosA("/rest/v1/logs").length, 0);

test("oferta: dono, sem plano e sem preço → sem_plano e não configurada", async () => {
  const res = await oferta(chamar("GET", OFERTA, "token-dono"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { bloqueio: "sem_plano", configurado: false, podeCobrar: true });
});

test("oferta: admin, plano active, preço definido → liberada", async () => {
  plano = "active";
  process.env.STRIPE_PRICE_RECUPERAR = "price_rc";
  const res = await oferta(chamar("GET", OFERTA, "token-admin"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { bloqueio: null, configurado: true, podeCobrar: true });
});

test("oferta: operador vê, mas não cobra", async () => {
  plano = "trialing";
  process.env.STRIPE_PRICE_RECUPERAR = "price_rc";
  const res = await oferta(chamar("GET", OFERTA, "token-operador"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { bloqueio: null, configurado: true, podeCobrar: false });
});

test("oferta: flag ligada → ja_assinado", async () => {
  plano = "active";
  ligado = true;
  const res = await oferta(chamar("GET", OFERTA, "token-dono"));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { bloqueio: string }).bloqueio, "ja_assinado");
});

test("oferta: tudo lido da loja de quem chama", async () => {
  await oferta(chamar("GET", OFERTA, "token-dono"));
  for (const caminho of ["/rest/v1/subscriptions", "/rest/v1/tenant_settings"]) {
    const [pedido] = pedidosA(caminho);
    assert.equal(pedido.url.searchParams.get("tenant_id"), `eq.${LOJA}`, caminho);
  }
});

test("oferta: vendedora, mesmo com o módulo, é 403 (a rota não está no mapa dela); sem login é 401", async () => {
  const vendedora = await oferta(chamar("GET", OFERTA, "token-vendedora-recuperar"));
  assert.equal(vendedora.status, 403);
  assert.equal(await vendedora.text(), MENSAGEM_BLOQUEIO);
  const semLogin = await oferta(chamar("GET", OFERTA, null));
  assert.equal(semLogin.status, 401);
  assert.equal(vistos.length, 0);
});

test("checkout: operador → 403 de billing", async () => {
  plano = "active";
  const res = await checkout(chamar("POST", CHECKOUT, "token-operador", { avisoConfirmado: true }));
  assert.equal(res.status, 403);
  assert.equal(await res.text(), "Sem permissao para billing.");
  semRegistroDeAviso();
});

test("checkout: vendedora com o módulo → 403 do mapa", async () => {
  plano = "active";
  const res = await checkout(chamar("POST", CHECKOUT, "token-vendedora-recuperar", { avisoConfirmado: true }));
  assert.equal(res.status, 403);
  assert.equal(await res.text(), MENSAGEM_BLOQUEIO);
  semRegistroDeAviso();
});

test("checkout: sem login → 401", async () => {
  const res = await checkout(chamar("POST", CHECKOUT, null, { avisoConfirmado: true }));
  assert.equal(res.status, 401);
  assert.equal(vistos.length, 0);
});

test("checkout: sem a confirmação do aviso (corpo vazio, false, JSON inválido, campo a mais) → 400, sem ir ao banco", async () => {
  plano = "active";
  process.env.STRIPE_PRICE_RECUPERAR = "price_rc";
  const corpos: unknown[] = [{}, { avisoConfirmado: false }, { avisoConfirmado: "true" }, { avisoConfirmado: true, preco: 1 }, "{não é json"];
  for (const corpo of corpos) {
    const res = await checkout(chamar("POST", CHECKOUT, "token-dono", corpo));
    assert.equal(res.status, 400, JSON.stringify(corpo));
    assert.deepEqual(await res.json(), AVISO_FALTANDO, JSON.stringify(corpo));
  }
  assert.equal(vistos.length, 0);
});

test("checkout: sem plano vivo → 409", async () => {
  const res = await checkout(chamar("POST", CHECKOUT, "token-dono", { avisoConfirmado: true }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "Assine um plano primeiro." });
  semRegistroDeAviso();
});

test("checkout: já ativo → 409", async () => {
  plano = "active";
  ligado = true;
  const res = await checkout(chamar("POST", CHECKOUT, "token-dono", { avisoConfirmado: true }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "O Recuperar já está ativo nesta loja." });
  semRegistroDeAviso();
});

test("checkout: sem STRIPE_PRICE_RECUPERAR → 503", async () => {
  plano = "active";
  const res = await checkout(chamar("POST", CHECKOUT, "token-admin", { avisoConfirmado: true }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "Assinatura do Recuperar indisponível no momento." });
  semRegistroDeAviso();
});
