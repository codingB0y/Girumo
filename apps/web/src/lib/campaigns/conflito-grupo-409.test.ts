import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { respostaConflitoGrupo } from "./conflito-grupo-409";

/**
 * O adaptador contra um PostgREST de mentira (desenho de `stores/campaign-groups-conflitos.test.ts`):
 * a recusa do trigger vira o 409 do contrato, e só ela — qualquer outro erro volta `null` para a
 * rota relançar. A mensagem chega aqui já embrulhada em `Error` pela store.
 */

type Pedido = { metodo: string; url: URL };

const pedidos: Pedido[] = [];
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: [] };

const postgrest = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url: new URL(req.url ?? "/", "http://postgrest.falso") });
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

function responder(status: number, corpo: unknown) {
  pedidos.length = 0;
  resposta = { status, corpo };
}

const A1 = "6a7e0000-0000-4000-8000-0000000000a1";
const recusa = (jid = "120363001@g.us") => new Error(`grupo_em_outra_campanha:${jid}:${A1}`);

test("a recusa do trigger vira o 409 do contrato, com o nome da outra campanha", async () => {
  responder(200, [{ id: A1, tenant_id: "loja-a", name: "Moda Kids do Sul", slug: "moda-kids" }]);

  const res = await respostaConflitoGrupo("loja-a", recusa());

  assert.ok(res);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    error: "Um dos grupos já está na campanha “Moda Kids do Sul”. Cada grupo fica em uma campanha só — tire de lá primeiro.",
    grupo: "120363001@g.us",
    campanha: { id: A1, name: "Moda Kids do Sul" },
  });
  // Mutante: ler o nome sem o tenant mostraria a campanha de outra loja que tenha este id.
  assert.equal(pedidos[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedidos[0].url.searchParams.get("id"), `eq.${A1}`);
});

test("JID com ':' e erro que não é Error (string) também viram 409", async () => {
  responder(200, [{ id: A1, name: "Moda Kids do Sul" }]);

  const res = await respostaConflitoGrupo("loja-a", `grupo_em_outra_campanha:abc:def@g.us:${A1}`);

  assert.ok(res);
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { grupo: string }).grupo, "abc:def@g.us");
});

test("falhar a leitura do nome não derruba o 409 — a recusa já foi entendida", async () => {
  responder(500, { code: "XX000", details: null, hint: null, message: "banco fora" });
  const erros: unknown[][] = [];
  const consoleError = console.error;
  console.error = (...args: unknown[]) => void erros.push(args);
  try {
    const res = await respostaConflitoGrupo("loja-a", recusa());

    assert.ok(res);
    assert.equal(res.status, 409);
    const corpo = (await res.json()) as { error: string; campanha: { id: string; name: string } };
    assert.deepEqual(corpo.campanha, { id: A1, name: "outra campanha" });
    assert.match(corpo.error, /“outra campanha”/);
  } finally {
    console.error = consoleError;
  }
  assert.equal(erros.length, 1, "a falha da leitura fica no log");
});

test("campanha que sumiu entre a recusa e a leitura: 409 com o nome genérico", async () => {
  responder(200, []);

  const res = await respostaConflitoGrupo("loja-a", recusa());

  assert.ok(res);
  assert.equal(res.status, 409);
  assert.equal(((await res.json()) as { campanha: { name: string } }).campanha.name, "outra campanha");
});

test("qualquer outro erro volta null, sem tocar o banco — a rota relança", async () => {
  responder(200, []);

  assert.equal(await respostaConflitoGrupo("loja-a", new Error("duplicate key value violates unique constraint")), null);
  assert.equal(await respostaConflitoGrupo("loja-a", undefined), null);
  assert.equal(await respostaConflitoGrupo("loja-a", new Error("grupo_em_outra_campanha:sem-uuid")), null);
  assert.equal(pedidos.length, 0);
});
