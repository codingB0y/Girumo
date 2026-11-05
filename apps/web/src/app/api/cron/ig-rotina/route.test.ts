import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { GET } from "./route";

/** Rota de ponta a ponta com um PostgREST de mentira: as duas chamadas ao banco são as funções de prazo. */

type Chamada = { metodo: string; pathname: string; corpo: unknown };
const banco: Chamada[] = [];
const corpoPessoas = { inativas: 2, loja_cancelada: 5 };
const corpoConversas = { resolvidas_parada_24h: 3, resolvidas_janela_fechou: 2, apagadas_12_meses: 1, apagadas_loja_cancelada: 4, marcadores_apagados: 6 };
let resposta: { status: number; body: unknown } | null = null;

const CRON_SECRET = "segredo-do-cron-com-mais-de-24-caracteres";

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    banco.push({ metodo: req.method ?? "", pathname: new URL(req.url ?? "/", "http://supabase.falso").pathname, corpo: bruto ? JSON.parse(bruto) : undefined });
    res.setHeader("Content-Type", "application/json");
    const caminho = banco[banco.length - 1].pathname;
    res.statusCode = resposta?.status ?? 200;
    res.end(JSON.stringify(resposta ? resposta.body : caminho.endsWith("ig_conversations_rotina") ? corpoConversas : corpoPessoas));
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
  resposta = null;
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

test("com o secret: roda os prazos das pessoas e das conversas e devolve as contagens das duas", async () => {
  const r = await chamar();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    ok: true,
    pessoas: { inativas: 2, lojaCancelada: 5 },
    conversas: { resolvidasParada24h: 3, resolvidasJanelaFechou: 2, apagadas12Meses: 1, apagadasLojaCancelada: 4, marcadoresApagados: 6 },
  });
  assert.deepEqual(banco.map((b) => b.pathname).sort(), ["/rest/v1/rpc/ig_conversations_rotina", "/rest/v1/rpc/ig_purge_contacts"]);
  const agora = banco.map((b) => String((b.corpo as { p_now: string }).p_now));
  assert.match(agora[0], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(agora[0], agora[1], "as duas rotinas usam o mesmo instante");
});

test("banco fora: 500 sem vazar a mensagem; a próxima hora tenta de novo", async () => {
  resposta = { status: 500, body: { code: "XX000", message: "senha do banco errada", details: null, hint: null } };
  const r = await chamar();
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: "falhou" });
});
