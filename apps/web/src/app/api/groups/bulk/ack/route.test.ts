import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { POST as Post } from "./route";

/**
 * O worker reporta o renome (`set_subject`) por aqui. O que se prova é o que a
 * rota repassa ao store e o que o store escreve: `groups.name` só muda quando o
 * `subject` ecoado chega como string idêntica à do job. PostgREST de mentira, no
 * desenho de `api/groups/grow/pending/route.test.ts`.
 */

const LOJA = "11111111-1111-4111-8111-111111111111";
const TOKEN = "token-da-engine-de-teste";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const GRUPO_ID = "33333333-3333-4333-8333-333333333333";
const NOME = "Moda Kids do Sul 3";

type Chamada = { metodo: string; tabela: string; corpo: unknown };
const chamadas: Chamada[] = [];

const JOB = {
  id: JOB_ID,
  tenant_id: LOJA,
  action: "set_subject",
  group_id: GRUPO_ID,
  subject: NOME,
  status: "running",
};

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const metodo = req.method ?? "GET";
    const tabela = new URL(req.url ?? "/", "http://falso").pathname.replace("/rest/v1/", "");
    chamadas.push({ metodo, tabela, corpo: bruto ? JSON.parse(bruto) : undefined });
    // `.maybeSingle()` pode pedir objeto ou lista, conforme a versão do cliente.
    const comoObjeto = String(req.headers.accept ?? "").includes("pgrst.object");
    const job = { ...JOB, status: "done" };
    const respostas: Record<string, unknown> = {
      "GET organizations": comoObjeto ? { id: LOJA, status: "active" } : [{ id: LOJA, status: "active" }],
      "GET group_bulk_jobs": comoObjeto ? JOB : [JOB],
      "PATCH group_bulk_jobs": comoObjeto ? job : [job],
      "PATCH groups": [],
    };
    const chave = `${metodo} ${tabela}`;
    res.setHeader("Content-Type", "application/json");
    res.statusCode = chave in respostas ? 200 : 500;
    res.end(JSON.stringify(chave in respostas ? respostas[chave] : { message: `inesperado: ${chave}` }));
  });
});

let POST: typeof Post;

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // `ENGINE_TOKEN` é lido na importação de `@/lib/auth`.
  process.env.ENGINE_TOKEN = TOKEN;
  ({ POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

const ack = (corpo: Record<string, unknown>) =>
  POST(
    new Request("http://girumo.test/api/groups/bulk/ack", {
      method: "POST",
      headers: { "x-engine-token": TOKEN, "x-tenant-id": LOJA, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );

const escritasEm = (tabela: string) => chamadas.filter((c) => c.metodo === "PATCH" && c.tabela === tabela);

test("set_subject done com o nome ecoado: grava groups.name e limpa o nome interno", async () => {
  const res = await ack({ id: JOB_ID, status: "done", subject: NOME });

  assert.equal(res.status, 200);
  const [job] = escritasEm("group_bulk_jobs");
  assert.equal((job?.corpo as { status: string }).status, "done");
  const [grupo] = escritasEm("groups");
  assert.deepEqual(grupo?.corpo, { name: NOME, display_name_base: "", display_number: 0 });
});

test("subject que não é string vale como ausente: job vira failed e groups.name não é gravado", async () => {
  const res = await ack({ id: JOB_ID, status: "done", subject: 123 });

  assert.equal(res.status, 200);
  const [job] = escritasEm("group_bulk_jobs");
  const corpo = job?.corpo as { status: string; error: string };
  assert.equal(corpo.status, "failed");
  assert.match(corpo.error, /Worker desatualizado/);
  assert.deepEqual(escritasEm("groups"), []);
});
