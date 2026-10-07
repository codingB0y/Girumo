import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createInvite, getOpenInviteByHash, listInvites, markInviteUsed, revokeOpenInvites } from "./instagram-invites";

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];

const linha = { id: "c1", tenant_id: "loja-a", discount_percent: 100, stripe_coupon_id: "cupom-1", expires_at: "2026-10-14T00:00:00Z", created_by: "admin-1", created_at: "2026-10-07T00:00:00Z", revoked_at: null, used_at: null, stripe_subscription_id: null };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? linha : [linha]));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

test("criar grava a loja e o hash; nunca seleciona o hash de volta", async () => {
  pedidos.length = 0;
  const c = await createInvite("loja-a", { id: "c1", tokenHash: "h".repeat(64), discountPercent: 100, stripeCouponId: "cupom-1", expiresAt: "2026-10-14T00:00:00Z", createdBy: "admin-1" });
  assert.equal(c.id, "c1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/instagram_invites"]);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.token_hash, "h".repeat(64));
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("token_hash"));
});

test("achar pelo hash filtra a loja da sessão e só o aberto e válido", async () => {
  pedidos.length = 0;
  await getOpenInviteByHash("loja-a", "abc", "2026-10-08T00:00:00Z");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", token_hash: "eq.abc", revoked_at: "is.null", used_at: "is.null", expires_at: "gt.2026-10-08T00:00:00Z" });
});

test("revogar, listar e marcar usado filtram a loja", async () => {
  pedidos.length = 0;
  const revogados = await revokeOpenInvites("loja-a");
  assert.equal(revogados[0].stripe_coupon_id, "cupom-1");
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", revoked_at: "is.null", used_at: "is.null" });
  await listInvites("loja-a");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", order: "created_at.desc", limit: "20" });
  await markInviteUsed("loja-a", "c1", "sub_ig");
  assert.equal(pedidos[2].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", id: "eq.c1", used_at: "is.null", revoked_at: "is.null" });
  assert.equal((pedidos[2].corpo as { stripe_subscription_id: string }).stripe_subscription_id, "sub_ig");
});
