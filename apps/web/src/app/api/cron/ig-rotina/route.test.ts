import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { GET } from "./route";

/** Rota de ponta a ponta com um PostgREST de mentira: a única chamada ao banco é a função de prazos. */

type Chamada = { metodo: string; pathname: string; corpo: unknown };
const banco: Chamada[] = [];
let resposta: { status: number; body: unknown } = { status: 200, body: { inativas: 2, loja_cancelada: 5 } };

const CRON_SECRET = "segredo-do-cron-com-mais-de-24-caracteres";

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    banco.push({ metodo: req.method ?? "", pathname: new URL(req.url ?? "/", "http://supabase.falso").pathname, corpo: bruto ? JSON.parse(bruto) : undefined });
    res.setHeader("Content-Type", "application/json");
    res.statusCode = resposta.status;
    res.end(JSON.stringify(resposta.body));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(supabase.address() as AddressInfo).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  banco.length = 0;
  resposta = { status: 200, body: { inativas: 2, loja_cancelada: 5 } };
});
after(() => {
  supabase.close();
});

const chamar = (autorizacao: string | null = `Bearer ${CRON_SECRET}`) =>
  GET(new Request("http://girumo.test/api/cron/ig-rotina", { headers: autorizacao === null ? {} : { authorization: autorizacao } }));

test("sem o secret certo: 401 e o banco nem é tocado", async () => {
  for (const autorizacao of [null, "Bearer outro-segredo-qualquer-com-24-chars", CRON_SECRET]) {
    assert.equal((await chamar(autorizacao)).status, 401, String(autorizacao));
  }
  delete process.env.CRON_SECRET;
  assert.equal((await chamar("Bearer ")).status, 401, "CRON_SECRET ausente nunca autoriza");
  assert.equal(banco.length, 0);
});

test("com o secret: roda os prazos e devolve as contagens", async () => {
  const r = await chamar();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, inativas: 2, lojaCancelada: 5 });
  assert.equal(banco.length, 1);
  assert.equal(banco[0].pathname, "/rest/v1/rpc/ig_purge_contacts");
  assert.match(String((banco[0].corpo as { p_now: string }).p_now), /^\d{4}-\d{2}-\d{2}T/);
});

test("banco fora: 500 sem vazar a mensagem; a próxima hora tenta de novo", async () => {
  resposta = { status: 500, body: { code: "XX000", message: "senha do banco errada", details: null, hint: null } };
  const r = await chamar();
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "falhou" });
});
