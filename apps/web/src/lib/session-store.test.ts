import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { getSession, setSession } from "./session-store";

/**
 * A sessão do painel contra um PostgREST de mentira (o desenho de `posts-hoje.test.ts`): a loja pode
 * ter o número dos grupos e o do atendimento, e só o primeiro é "a sessão". Telefones inventados.
 */

type Pedido = { metodo: string; url: URL };

const GRUPOS = {
  id: "inst-g",
  phone: "556299990001",
  status: "disconnected",
  connected_at: "2026-09-01T00:00:00Z",
  last_seen_at: null,
  metadata: {},
  updated_at: "2026-10-01T00:00:00Z",
  purpose: "grupos",
};
const ATENDIMENTO = {
  ...GRUPOS,
  id: "inst-p",
  phone: "5562988880002",
  status: "connected",
  updated_at: "2026-10-29T00:00:00Z",
  purpose: "privado",
};

const pedidos: Pedido[] = [];
let linhas: Array<typeof GRUPOS> = [];

const postgrest = createServer((req, res) => {
  req.on("data", () => undefined);
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://postgrest.falso");
    pedidos.push({ metodo: req.method ?? "", url });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "PATCH") {
      // A escrita pede o objeto (.single()): vnd.pgrst.object+json.
      res.end(JSON.stringify(GRUPOS));
      return;
    }
    // Como o PostgREST: `purpose=eq.X` recorta e `limit` corta, na ordem em que as linhas estão.
    const purpose = url.searchParams.get("purpose");
    const limite = Number(url.searchParams.get("limit") ?? linhas.length);
    const recorte = linhas.filter((l) => purpose === null || purpose === `eq.${l.purpose}`);
    res.end(JSON.stringify(recorte.slice(0, limite)));
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
  linhas = [];
});

test("a sessão é a do número dos grupos: o do atendimento conectado não acende 'conectado'", async () => {
  linhas = [ATENDIMENTO, GRUPOS];
  const s = await getSession("loja-a");
  assert.equal(s.status, "disconnected");
  assert.equal(s.phone, "556299990001"); // getSession engole erro e devolve o padrão: o telefone prova que leu
  const [leitura] = pedidos;
  assert.equal(leitura.url.searchParams.get("tenant_id"), "eq.loja-a");
  // Mutante: sem o filtro, o atendimento (conectado e mais recente) vira a sessão e o painel deixa postar.
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.grupos");
});

test("loja só com o número do atendimento: sem sessão", async () => {
  linhas = [ATENDIMENTO];
  const s = await getSession("loja-a");
  assert.equal(s.status, "disconnected");
  assert.equal(s.phone, null);
});

test("o heartbeat legado (setSession) só grava no número dos grupos", async () => {
  linhas = [ATENDIMENTO, GRUPOS];
  await setSession("loja-a", { status: "disconnected" });
  const [leitura] = pedidos.filter((p) => p.metodo === "GET");
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.grupos");
  const [escrita] = pedidos.filter((p) => p.metodo === "PATCH");
  assert.equal(escrita.url.searchParams.get("id"), "eq.inst-g");
  assert.equal(escrita.url.searchParams.get("tenant_id"), "eq.loja-a");
});
