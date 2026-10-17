import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { cancelCampaignBroadcasts, claimPendingBroadcasts } from "./broadcasts";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `broadcast-deliveries.test.ts`): prova, sem banco, o que o claim do motor legado
 * (`/api/dispatch/pending`) pede. Ele só pega `run_id is null`, e `enqueue_broadcast`
 * sempre grava run_id — mas um disparo com regra de destino (`target_rule`) tem
 * `group_ids` vazio, e o motor legado leria `group_ids` vazio como "todos os grupos"
 * (spec 2026-10-10-postar-por-grupo §5.5).
 */

type Pedido = { metodo: string; url: URL; corpo: unknown };
const pedidos: Pedido[] = [];
/** Corpo devolvido a cada pedido; cada teste troca o que precisa. */
let responder: (pedido: Pedido) => unknown = () => [];

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    const pedido = { metodo: req.method ?? "", url, corpo: bruto ? JSON.parse(bruto) : null };
    pedidos.push(pedido);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(responder(pedido)));
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

test("o claim legado só pega disparo da loja, na fila, sem run_id e sem regra de destino", async () => {
  pedidos.length = 0;
  responder = () => [];

  assert.deepEqual(await claimPendingBroadcasts("loja-a"), []);

  assert.equal(pedidos.length, 1);
  const pedido = pedidos[0];
  assert.ok(pedido, "nenhum pedido chegou ao PostgREST");
  assert.equal(pedido.metodo, "PATCH");
  assert.equal(pedido.url.pathname, "/rest/v1/broadcasts");
  // Mutante: sem este filtro, disparo com regra e group_ids vazio iria para TODOS os grupos.
  assert.equal(pedido.url.searchParams.get("target_rule"), "is.null");
  // Mutantes antigos: sem run_id o legado reenviaria o que o worker novo enfileirou;
  // sem tenant, claimaria disparo de outra loja.
  assert.equal(pedido.url.searchParams.get("run_id"), "is.null");
  assert.equal(pedido.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedido.url.searchParams.get("status"), "eq.queued");
});

/**
 * Excluir a campanha solta os posts dela (`campaign_group_id` → SET NULL) e o
 * promotor de agendamentos do worker não olha campanha: sem este cancelamento o
 * post recorrente com lista fixa seguia saindo nos grupos, sem tela para parar.
 */
test("cancelar os posts da campanha apaga só agendamento pendente e barra só comando na fila, da loja", async () => {
  pedidos.length = 0;
  responder = ({ metodo, url }) =>
    metodo === "GET" && url.pathname === "/rest/v1/broadcasts" ? [{ id: "post-1" }, { id: "post-2" }] : [];

  await cancelCampaignBroadcasts("loja-a", "camp-1");

  assert.deepEqual(
    pedidos.map(({ metodo, url }) => `${metodo} ${url.pathname}`),
    ["GET /rest/v1/broadcasts", "DELETE /rest/v1/schedules", "PATCH /rest/v1/engine_commands"],
  );
  const [posts, agendamentos, comandos] = pedidos;
  // Mutantes: sem o tenant, a campanha de mesmo id de outra loja teria os posts cancelados.
  assert.equal(posts.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(posts.url.searchParams.get("campaign_group_id"), "eq.camp-1");

  assert.equal(agendamentos.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(agendamentos.url.searchParams.get("broadcast_id"), "in.(post-1,post-2)");
  // Mutante: sem o status, apagaria o histórico do agendamento que já rodou.
  assert.equal(agendamentos.url.searchParams.get("status"), "eq.pending");

  assert.equal(comandos.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(comandos.url.searchParams.get("origin_kind"), "eq.broadcast");
  assert.equal(comandos.url.searchParams.get("origin_id"), "in.(post-1,post-2)");
  // Mutante: `processing` já saiu para o WhatsApp; marcar cancelado mentiria.
  assert.equal(comandos.url.searchParams.get("status"), "eq.queued");
  assert.deepEqual(comandos.corpo, { status: "canceled" });
});

test("campanha sem post: só a leitura, nada para cancelar", async () => {
  pedidos.length = 0;
  responder = () => [];

  await cancelCampaignBroadcasts("loja-a", "camp-vazia");

  assert.deepEqual(pedidos.map(({ metodo, url }) => `${metodo} ${url.pathname}`), ["GET /rest/v1/broadcasts"]);
});
