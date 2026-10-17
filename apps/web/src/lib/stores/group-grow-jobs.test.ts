import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { enqueueGrowJob, listGroupsCreatedSince, listGroupsCreatedSinceByTenant, nextSeq } from "./group-grow-jobs";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `leads.test.ts`): prova, sem banco, os filtros da leitura dos grupos abertos
 * pelo "Grupo lotou → abre outro". O service-role passa por cima do RLS.
 */

type Pedido = { metodo: string; url: URL; corpo: unknown };

const pedidos: Pedido[] = [];
let linhas: unknown[] = [];
/** Respostas por pedido, na ordem; vazia = todos recebem `linhas`. */
let respostas: unknown[][] = [];

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (pedaco) => (bruto += pedaco));
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "GET",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : null,
    });
    const resposta = respostas.shift() ?? linhas;
    // `.single()` pede objeto, como o PostgREST de verdade devolve.
    const objeto = req.headers.accept?.includes("vnd.pgrst.object+json");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(objeto ? resposta[0] : resposta));
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

function zerar(): void {
  pedidos.length = 0;
  linhas = [];
  respostas = [];
}

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

test("lê só os grupos criados pela campanha da loja desde o começo do dia, do mais antigo ao mais novo", async () => {
  zerar();
  linhas = [{ seq: 40, subject: "Mega Stock 40", whatsapp_group_id: "g40@g.us", updated_at: "2026-09-29T12:14:00+00:00" }];

  assert.deepEqual(await listGroupsCreatedSince("loja-a", "camp-1", "2026-09-29T03:00:00.000Z"), linhas);

  assert.equal(pedidos.length, 1);
  const [{ url }] = pedidos;
  assert.equal(url.pathname, "/rest/v1/group_grow_jobs");
  assert.equal(url.searchParams.get("select"), "seq,subject,whatsapp_group_id,updated_at");
  // Mutantes: sem o tenant, a campanha de outra loja com o mesmo id; sem o status,
  // o job que falhou apareceria como grupo aberto.
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    campaign_group_id: "eq.camp-1",
    status: "eq.created",
    updated_at: "gte.2026-09-29T03:00:00.000Z",
    order: "updated_at.asc",
  });
});

test("na loja inteira, lê os grupos abertos de todas as campanhas da loja, sem filtrar campanha", async () => {
  zerar();
  linhas = [{ seq: 7, subject: "Brás 7", whatsapp_group_id: "g7@g.us", updated_at: "2026-10-02T12:14:00+00:00" }];

  assert.deepEqual(await listGroupsCreatedSinceByTenant("loja-a", "2026-10-02T03:00:00.000Z"), linhas);

  assert.equal(pedidos.length, 1);
  const [{ url }] = pedidos;
  assert.equal(url.pathname, "/rest/v1/group_grow_jobs");
  assert.equal(url.searchParams.get("select"), "seq,subject,whatsapp_group_id,updated_at");
  // Mutante: sem o tenant, a Início de uma loja mostraria "novo 09:14" de outra.
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    status: "eq.created",
    updated_at: "gte.2026-10-02T03:00:00.000Z",
    order: "updated_at.asc",
  });
});

test("o próximo número ignora job que falhou sem grupo no WhatsApp", async () => {
  // Prod: 2447 jobs falhos "sem instância" numa campanha sem grupo. Contando
  // eles, o 1º grupo de verdade nasceria "… 2448".
  zerar();

  assert.equal(await nextSeq("loja-a", "camp-1", 0), 1);

  assert.equal(pedidos.length, 1);
  const [{ url }] = pedidos;
  assert.equal(url.searchParams.get("select"), "seq");
  // Mutante: sem o `or`, o failed sem JID volta a gastar número. Com JID o grupo
  // existe no WhatsApp (ex.: "sem inviteLink") e o número segue gasto.
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    campaign_group_id: "eq.camp-1",
    or: "(status.neq.failed,whatsapp_group_id.not.is.null)",
    order: "seq.desc",
    limit: "1",
  });
});

test("o próximo número continua do maior número gasto", async () => {
  zerar();
  linhas = [{ seq: 4 }];

  assert.equal(await nextSeq("loja-a", "camp-1", 2), 5);
});

const INPUT = {
  campaign_group_id: "camp-1",
  campaign_slug: "bazar",
  seq: 1,
  subject: "Bazar 1",
  announce: true,
  member_add_mode: "admin_add" as const,
};

test("enfileirar reaproveita a linha do job que falhou sem grupo com o mesmo número", async () => {
  // O índice único (tenant, campanha, seq) faria o INSERT estourar: o nextSeq
  // devolve de novo o número do failed sem JID.
  zerar();
  const reaproveitada = { id: "job-velho", ...INPUT, status: "queued" };
  respostas = [[reaproveitada]];

  assert.deepEqual(await enqueueGrowJob("loja-a", INPUT), reaproveitada);

  assert.equal(pedidos.length, 1, "achou a linha: não insere outra");
  const [{ metodo, url, corpo }] = pedidos;
  assert.equal(metodo, "PATCH");
  // Mutantes: sem `status=failed` ou sem `whatsapp_group_id=is.null`, um job em
  // voo ou já criado voltaria para a fila — e viraria um grupo duplicado.
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    campaign_group_id: "eq.camp-1",
    seq: "eq.1",
    status: "eq.failed",
    whatsapp_group_id: "is.null",
  });
  assert.equal(typeof corpo, "object");
  const patch = corpo as Record<string, unknown>;
  assert.equal(patch.status, "queued");
  assert.equal(patch.subject, "Bazar 1");
  for (const campo of ["error", "running_since", "last_ack_at", "invite_url", "description", "media_id"]) {
    assert.equal(patch[campo], null, `${campo} da tentativa anterior não pode sobrar`);
  }
});

test("sem linha para reaproveitar, enfileirar insere o job", async () => {
  zerar();
  const nova = { id: "job-novo", ...INPUT, status: "queued" };
  respostas = [[], [nova]];

  assert.deepEqual(await enqueueGrowJob("loja-a", INPUT), nova);

  assert.deepEqual(
    pedidos.map((p) => p.metodo),
    ["PATCH", "POST"],
  );
  assert.deepEqual(pedidos[1]?.corpo, { ...INPUT, tenant_id: "loja-a" });
});
