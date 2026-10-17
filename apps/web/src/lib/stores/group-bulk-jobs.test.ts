import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { ackBulk, claimBulk } from "./group-bulk-jobs";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (desenho de
 * `leads.test.ts`): prova, sem banco, o que o renome do Padronizar escreve — e
 * onde. O service-role passa por cima do RLS, então o filtro de tenant conferido
 * aqui é a proteção de verdade.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
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

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

const JOB = {
  id: "job-1",
  tenant_id: "loja-a",
  campaign_group_id: "camp-1",
  batch_id: "lote-1",
  action: "set_subject",
  group_id: "grp-1",
  whatsapp_group_id: "111@g.us",
  description: null,
  media_id: null,
  target_phone: null,
  subject: "Moda Kids do Sul 3",
  status: "running",
  attempts: 1,
  error: null,
  created_at: "2026-10-10T12:00:00+00:00",
  running_since: "2026-10-10T12:00:04+00:00",
  last_ack_at: "2026-10-10T12:00:04+00:00",
  updated_at: "2026-10-10T12:00:04+00:00",
};

/** Ack devolve o job atualizado; o update de `groups` responde 204 (return=minimal). */
function comAck(linha: Record<string, unknown>): (chamada: Chamada) => Resposta {
  return ({ metodo, url }) => {
    if (metodo === "PATCH" && url.pathname === "/rest/v1/group_bulk_jobs") return { status: 200, corpo: [linha] };
    if (metodo === "PATCH" && url.pathname === "/rest/v1/groups") return { status: 204 };
    return { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

test("o claim entrega ao worker o nome do renome, e só no renome", async () => {
  chamadas.length = 0;
  responder = ({ metodo, url }) => {
    // failStaleRunning roda antes do claim e não acha nada preso.
    if (metodo === "PATCH" && url.pathname === "/rest/v1/group_bulk_jobs") return { status: 200, corpo: [] };
    if (metodo === "POST" && url.pathname === "/rest/v1/rpc/claim_bulk_jobs") {
      return { status: 200, corpo: [JOB, { ...JOB, id: "job-2", action: "open", subject: null }] };
    }
    return { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };

  const claim = await claimBulk("loja-a");

  assert.deepEqual(claim[0], {
    id: "job-1",
    action: "set_subject",
    whatsappGroupId: "111@g.us",
    description: undefined,
    mediaId: undefined,
    targetPhone: undefined,
    subject: "Moda Kids do Sul 3",
  });
  assert.equal(claim[1]?.subject, undefined);
  const [rpc] = feitas("POST", "/rest/v1/rpc/claim_bulk_jobs");
  assert.deepEqual(rpc?.corpo, { p_tenant: "loja-a", p_limit: 1 });
});

test("renome concluído grava o nome novo e limpa o nome interno, só no grupo da loja", async () => {
  chamadas.length = 0;
  responder = comAck({ ...JOB, status: "done" });

  const job = await ackBulk("loja-a", "job-1", { status: "done" });

  assert.equal(job?.subject, "Moda Kids do Sul 3");
  const [grupo] = feitas("PATCH", "/rest/v1/groups");
  assert.ok(grupo, "o nome do grupo não foi gravado");
  // Mutantes: sem o tenant, o service-role escreveria no grupo de outra loja com
  // o mesmo id; sem limpar o nome interno, o painel continuaria mostrando o
  // apelido antigo por cima do nome novo (group-display-name.ts).
  assert.equal(grupo.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(grupo.url.searchParams.get("id"), "eq.grp-1");
  assert.deepEqual(grupo.corpo, { name: "Moda Kids do Sul 3", display_name_base: "", display_number: 0 });
});

test("renome que falhou não mexe no nome do grupo", async () => {
  chamadas.length = 0;
  responder = comAck({ ...JOB, status: "failed", error: "Evolution group/updateGroupSubject falhou (403)" });

  // No WhatsApp o grupo continua com o nome antigo; gravar o novo aqui faria o
  // painel mentir.
  await ackBulk("loja-a", "job-1", { status: "failed", error: "Evolution group/updateGroupSubject falhou (403)" });

  assert.equal(feitas("PATCH", "/rest/v1/groups").length, 0);
});

test("renome concluído sem nome no job não apaga o nome do grupo", async () => {
  chamadas.length = 0;
  responder = comAck({ ...JOB, status: "done", subject: null });

  await ackBulk("loja-a", "job-1", { status: "done" });

  assert.equal(feitas("PATCH", "/rest/v1/groups").length, 0);
});
