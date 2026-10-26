import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { lerPostsHoje } from "./posts-hoje";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `broadcast-deliveries.test.ts`): prova, sem banco, o que a leitura pede e que
 * resposta fora do formato lança em vez de virar contagem.
 */

type Pedido = { metodo: string; url: URL; corpo: unknown };

const pedidos: Pedido[] = [];
let resposta: unknown = {};
let status = 200;

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    });
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resposta));
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

test("lê a contagem da loja pelo RPC e devolve teto e grupos", async () => {
  pedidos.length = 0;
  resposta = { teto: 4, grupos: { "1@g.us": 3 } };

  assert.deepEqual(await lerPostsHoje("loja-a"), { teto: 4, grupos: { "1@g.us": 3 } });

  assert.equal(pedidos.length, 1);
  const [pedido] = pedidos;
  assert.equal(pedido.metodo, "POST");
  assert.equal(pedido.url.pathname, "/rest/v1/rpc/posts_hoje_por_grupo");
  // Mutante: sem o tenant no corpo, a função não saberia de qual loja contar.
  assert.deepEqual(pedido.corpo, { p_tenant: "loja-a" });
});

test("sem post hoje o banco manda grupos vazio e o teto continua", async () => {
  resposta = { teto: 4, grupos: {} };
  assert.deepEqual(await lerPostsHoje("loja-a"), { teto: 4, grupos: {} });
});

test("resposta fora do formato lança em vez de virar contagem zero", async () => {
  const fora: unknown[] = [
    { teto: "4", grupos: {} },
    { teto: 0, grupos: {} },
    { teto: 4.5, grupos: {} },
    { teto: 4, grupos: { "1@g.us": -1 } },
    { teto: 4, grupos: { "1@g.us": 1.5 } },
    { teto: 4, grupos: { "1@g.us": "3" } },
    { teto: 4, grupos: [] },
    { teto: 4 },
    { grupos: {} },
    null,
  ];
  for (const corpo of fora) {
    resposta = corpo;
    await assert.rejects(lerPostsHoje("loja-a"), /posts_hoje_por_grupo devolveu/, JSON.stringify(corpo));
  }
});

test("erro do RPC lança com a mensagem do banco", async () => {
  status = 500;
  resposta = { message: "boom" };
  try {
    await assert.rejects(lerPostsHoje("loja-a"), /boom/);
  } finally {
    status = 200;
  }
});
