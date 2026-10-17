import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

/**
 * O DELETE de verdade — getTenantContext, encerrarLoja, supabase-js — contra um
 * Supabase falso em 127.0.0.1 (padrão de `api/members/members.test.ts`). Prova a
 * ordem que importa: a loja é encerrada ANTES de o login sumir, e se o
 * encerramento falha o login fica — sem login ninguém abre o portal para cancelar.
 *
 * A loja daqui não tem customer no Stripe, então o Stripe de verdade nunca é
 * criado; o caminho com assinatura está em `lib/billing/encerrar-loja.test.ts`.
 */

type Pedido = { metodo: string; caminho: string; url: URL };
type Rota = typeof import("./route");

const LOJA = "11111111-1111-4111-8111-111111111111";
const DONO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const pedidos: Pedido[] = [];
let falhaEm: string | null = null;
let rota: Rota;

function lerCorpo(req: IncomingMessage): Promise<void> {
  return new Promise((pronto) => {
    req.on("data", () => {});
    req.on("end", () => pronto());
  });
}

const supabase = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://supabase.falso");
  await lerCorpo(req);
  const caminho = url.pathname.replace("/rest/v1/", "");
  pedidos.push({ metodo: req.method ?? "", caminho, url });
  res.setHeader("Content-Type", "application/json");

  if (caminho === falhaEm) {
    res.statusCode = 500;
    res.end(JSON.stringify({ message: `falha em ${caminho}` }));
    return;
  }
  if (caminho === "/auth/v1/user") {
    res.end(JSON.stringify({ id: DONO, email: "dono@loja.test", aud: "authenticated", app_metadata: {}, user_metadata: {} }));
    return;
  }
  if (caminho === "memberships") {
    res.end(JSON.stringify([{ tenant_id: LOJA, role: "owner", modules: [] }]));
    return;
  }
  if (caminho === "organizations") {
    res.end(JSON.stringify({ stripe_customer_id: null }));
    return;
  }
  // schedules (DELETE), engine_commands (PATCH) e o deleteUser do Auth admin.
  res.end(JSON.stringify(caminho.startsWith("/auth/") ? {} : [{ id: "linha-1" }]));
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-do-falso";
  process.env.SUPABASE_ANON_KEY = "anon-do-falso";
  process.env.AUTH_SECRET ??= "segredo-do-teste";
  rota = await import("./route");
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  pedidos.length = 0;
  falhaEm = null;
});

function apagar(): Request {
  return new Request("http://localhost/api/auth/account", {
    method: "DELETE",
    headers: { authorization: "Bearer token-do-dono" },
  });
}

const APAGA_LOGIN = `/auth/v1/admin/users/${DONO}`;

test("DELETE do dono: encerra a loja (agendamentos e fila) antes de apagar o login", async () => {
  const res = await rota.DELETE(apagar());
  assert.equal(res.status, 200);

  const ordem = pedidos.map((p) => `${p.metodo} ${p.caminho}`);
  assert.deepEqual(ordem.slice(2), [
    "GET organizations",
    "DELETE schedules",
    "PATCH engine_commands",
    `DELETE ${APAGA_LOGIN}`,
  ]);
  // A loja encerrada é a de quem pediu, não outra.
  for (const p of pedidos.filter((x) => x.caminho === "schedules" || x.caminho === "engine_commands")) {
    assert.equal(p.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  }
});

test("DELETE do dono: se encerrar a loja falha, o login fica e a resposta diz o que houve", async () => {
  falhaEm = "engine_commands";
  const res = await rota.DELETE(apagar());

  assert.equal(res.status, 502);
  const corpo = (await res.json()) as { error: string };
  assert.match(corpo.error, /não foi apagada/i);
  assert.equal(
    pedidos.some((p) => p.caminho === APAGA_LOGIN),
    false,
    "apagou o login com a loja ainda ativa",
  );
});
