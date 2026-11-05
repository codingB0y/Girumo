import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { tombstoneHash } from "@/lib/ig/conversas/situacao";
import {
  addTombstone, deleteConversationsOf, getConversationById, getConversationByIgUserId, getConversationByZernioId, hasTombstone,
  listConversationEvents, listConversations, recordConversationEvent, runConversationRoutine, touchConversation, updateConversation,
} from "./ig-conversations";

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const conversa = { id: "c1", tenant_id: "loja-a", ig_account_id: "a1", zernio_conversation_id: "z1", ig_user_id: "u1", username: "ana", display_name: "Ana", status: "open", folder: "inbox", unread_count: 1, last_message_at: "2026-11-06T10:00:00Z", last_direction: "in", last_preview: "oi", bot_paused_until: null, updated_at: "2026-11-06T10:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? conversa : [conversa]));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

test("touch chama a função atômica com a loja e todos os parâmetros", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: conversa };
  const c = await touchConversation("loja-a", { zernioConversationId: "z1", igUserId: "u1", username: "ana", direction: "in", at: "2026-11-06T10:00:00Z", preview: "oi", status: "waiting" });
  assert.equal(c.id, "c1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/rpc/ig_conversation_touch"]);
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a", p_zernio_conversation_id: "z1", p_ig_user_id: "u1", p_ig_account_id: null, p_username: "ana", p_display_name: null,
    p_direction: "in", p_at: "2026-11-06T10:00:00Z", p_preview: "oi", p_status: "waiting",
  });
  proxima = { status: 500, body: { code: "XX000", message: "banco fora", details: null, hint: null } };
  await assert.rejects(() => touchConversation("loja-a", { zernioConversationId: "z1", igUserId: "u1", direction: "out", at: "2026-11-06T10:00:00Z", preview: null, status: null }), /banco fora/);
});

test("ler por id, por id da Zernio e por pessoa filtram a loja; ausente volta null", async () => {
  pedidos.length = 0;
  assert.equal((await getConversationById("loja-a", "c1"))?.username, "ana");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.c1" });
  await getConversationByZernioId("loja-a", "z1");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", zernio_conversation_id: "eq.z1" });
  assert.equal((await getConversationByIgUserId("loja-a", "u1"))?.id, "c1");
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", ig_user_id: "eq.u1", order: "last_message_at.desc.nullslast", limit: "1" });
  proxima = { status: 200, body: [] };
  assert.equal(await getConversationByIgUserId("loja-a", "x"), null);
});

test("listar: filtros, busca sem caractere de sintaxe, mais recentes primeiro, 51 pedidas para saber se há mais", async () => {
  pedidos.length = 0;
  await listConversations("loja-a", { status: "waiting", unread: true, busca: "a_(na),*%", cursor: "50" });
  assert.deepEqual(filtros(pedidos[0].url), {
    tenant_id: "eq.loja-a", status: "eq.waiting", unread_count: "gt.0",
    or: "(username.ilike.%ana%,display_name.ilike.%ana%)",
    order: "last_message_at.desc.nullslast,id.desc", offset: "50", limit: "51",
  });
  pedidos.length = 0;
  await listConversations("loja-a", { cursor: "1 or 1=1" });
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", order: "last_message_at.desc.nullslast,id.desc", offset: "0", limit: "51" });
});

test("listar: 51 linhas viram 50 mais a posição da próxima página, mesmo com horário repetido ou sem data", async () => {
  const muitas = Array.from({ length: 51 }, (_, i) => ({ ...conversa, id: `c${i}`, last_message_at: i >= 48 ? null : "2026-11-06T10:00:00Z" }));
  proxima = { status: 200, body: muitas };
  const pagina = await listConversations("loja-a");
  assert.equal(pagina.items.length, 50);
  assert.equal(pagina.nextCursor, "50");
  proxima = { status: 200, body: muitas.slice(0, 3) };
  assert.equal((await listConversations("loja-a")).nextCursor, null);
});

test("atualizar filtra a loja; conversa de outra loja volta null", async () => {
  pedidos.length = 0;
  const c = await updateConversation("loja-a", "c1", { status: "resolved", unread_count: 0 });
  assert.equal(c?.id, "c1");
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.c1" });
  assert.deepEqual(pedidos[0].corpo, { status: "resolved", unread_count: 0 });
  proxima = { status: 200, body: [] };
  assert.equal(await updateConversation("loja-b", "c1", { status: "open" }), null);
});

test("evento: grava a loja e só os campos sem texto; listar filtra loja e conversa", async () => {
  pedidos.length = 0;
  await recordConversationEvent("loja-a", { conversationId: "c1", kind: "bot_message", runId: "r1", detail: "handoff" });
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/ig_conversation_events"]);
  assert.deepEqual(pedidos[0].corpo, { tenant_id: "loja-a", conversation_id: "c1", kind: "bot_message", zernio_message_id: null, run_id: "r1", detail: "handoff" });
  await listConversationEvents("loja-a", "c1");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", conversation_id: "eq.c1", order: "occurred_at.asc", limit: "1000" });
});

test("apagar a pessoa tira só o índice dela na loja e devolve os ids da Zernio", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: [{ zernio_conversation_id: "z1", ig_account_id: "a1" }] };
  assert.deepEqual(await deleteConversationsOf("loja-a", "u1"), [{ zernioConversationId: "z1", igAccountId: "a1" }]);
  assert.equal(pedidos[0].metodo, "DELETE");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", ig_user_id: "eq.u1" });
});

test("marcador guarda o hash, nunca o id, e consulta pelo mesmo hash na loja", async () => {
  pedidos.length = 0;
  await addTombstone("loja-a", "u1");
  const hash = tombstoneHash("loja-a", "u1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname, pedidos[0].url.searchParams.get("on_conflict")], ["POST", "/rest/v1/ig_contact_tombstones", "tenant_id,ig_user_hash"]);
  const corpo = pedidos[0].corpo as Record<string, string>;
  assert.equal(corpo.ig_user_hash, hash);
  assert.equal(JSON.stringify(corpo).includes('"u1"'), false);
  proxima = { status: 200, body: { ig_user_hash: hash } };
  assert.equal(await hasTombstone("loja-a", "u1"), true);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", ig_user_hash: `eq.${hash}` });
  proxima = { status: 200, body: null };
  assert.equal(await hasTombstone("loja-a", "u2"), false);
});

test("rotina chama a função e devolve as contagens (zero quando faltam)", async () => {
  pedidos.length = 0;
  proxima = { status: 200, body: { resolvidas_parada_24h: 3, resolvidas_janela_fechou: 2, apagadas_12_meses: 1, apagadas_loja_cancelada: 4, marcadores_apagados: 5 } };
  assert.deepEqual(await runConversationRoutine("2026-11-06T12:00:00Z"), { resolvidasParada24h: 3, resolvidasJanelaFechou: 2, apagadas12Meses: 1, apagadasLojaCancelada: 4, marcadoresApagados: 5 });
  assert.deepEqual([pedidos[0].url.pathname, pedidos[0].corpo], ["/rest/v1/rpc/ig_conversations_rotina", { p_now: "2026-11-06T12:00:00Z" }]);
  proxima = { status: 200, body: {} };
  assert.equal((await runConversationRoutine("2026-11-06T12:00:00Z")).resolvidasParada24h, 0);
});
