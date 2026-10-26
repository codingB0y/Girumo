import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { GET as RotaGet } from "./route";

/**
 * `GET /api/groups/posts-hoje` contra um Supabase de mentira (o desenho de
 * `campanhas/[slug]/messages/route.test.ts`: login por Bearer, memberships e o
 * RPC respondidos por um servidor local). A rota não decide número nenhum: o teto
 * vem do banco, e o que se prova aqui é de quem ela lê e quem pode ler.
 */

const RPC = "/rest/v1/rpc/posts_hoje_por_grupo";
const DO_BANCO = { teto: 4, grupos: { "120363001@g.us": 3 } };

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };
type Quem = { papel: "owner" | "seller"; modulos: string[] };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let GET: typeof RotaGet;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  ({ GET } = await import("./route"));
});

after(() => {
  supabase.close();
});

/** Usuário logado por Bearer na `loja-b`; o RPC responde `rpc`. */
function banco(quem: Partial<Quem>, rpc: Resposta): (chamada: Chamada) => Resposta {
  const { papel = "owner", modulos = [] } = quem;
  return ({ url }) => {
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") {
      return { status: 200, corpo: [{ tenant_id: "loja-b", role: papel, modules: modulos }] };
    }
    if (url.pathname === RPC) return rpc;
    return { status: 500, corpo: { message: `inesperado: ${url.pathname}` } };
  };
}

function ler(headers: Record<string, string> = {}, busca = ""): Promise<Response> {
  return GET(
    new Request(`http://girumo.test/api/groups/posts-hoje${busca}`, {
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", ...headers },
    }),
  );
}

function rpcsFeitos(): Chamada[] {
  return chamadas.filter((c) => c.url.pathname === RPC);
}

test("quem posta lê a contagem da própria loja", async () => {
  chamadas.length = 0;
  responder = banco({ papel: "owner" }, { status: 200, corpo: DO_BANCO });

  // Mutante: tenant tirado da query em vez da sessão. A rota não aceita tenant de fora.
  const res = await ler({}, "?tenantId=loja-de-outro&tenant_id=loja-de-outro");

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), DO_BANCO);
  assert.equal(rpcsFeitos().length, 1);
  assert.deepEqual(rpcsFeitos()[0].corpo, { p_tenant: "loja-b" });
});

test("a vendedora com o módulo de postar lê a contagem da loja dela", async () => {
  chamadas.length = 0;
  responder = banco({ papel: "seller", modulos: ["postar"] }, { status: 200, corpo: DO_BANCO });

  // Mutante: a rota fora do mapa de `lib/auth/modulos.ts` — a vendedora levaria 403 no composer.
  const res = await ler();

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), DO_BANCO);
  assert.deepEqual(rpcsFeitos().map((c) => c.corpo), [{ p_tenant: "loja-b" }]);
});

test("vendedora sem o módulo de postar recebe 403", async () => {
  chamadas.length = 0;
  // Vendedora sem o módulo de postar: só o de vendas.
  responder = banco({ papel: "seller", modulos: [] }, { status: 200, corpo: DO_BANCO });

  const res = await ler();

  assert.equal(res.status, 403);
  assert.equal(rpcsFeitos().length, 0);
});

test("a engine não lê: é rota de painel", async () => {
  chamadas.length = 0;
  responder = banco({}, { status: 200, corpo: DO_BANCO });

  const res = await ler({ "x-engine-token": "qualquer" });

  assert.equal(res.status, 403);
  assert.equal(rpcsFeitos().length, 0);
});

test("leitura que falha vira 500 com texto pronto para a tela", async () => {
  chamadas.length = 0;
  responder = banco({ papel: "owner" }, { status: 500, corpo: { message: "boom" } });
  const erro = console.error;
  console.error = () => {};
  try {
    const res = await ler();
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Não deu para ler os posts de hoje." });
  } finally {
    console.error = erro;
  }
});
