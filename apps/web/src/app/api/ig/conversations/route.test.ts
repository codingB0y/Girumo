import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { assinaturaDeEnvio } from "@/lib/ig/conversas/campo";
import { chaveDeEnvio } from "@/lib/ig/conversas/fio";
import { tombstoneHash } from "@/lib/ig/conversas/situacao";
import { comId, CONV_ID, criarAmbiente, horasAtras, LOJA } from "@/test/ig-conversas-fake";
import { GET as CONTATO, PATCH } from "./[id]/route";
import { GET as MIDIA } from "./[id]/media/route";
import { GET as FIO, POST as ENVIAR } from "./[id]/messages/route";
import { POST as LIDA } from "./[id]/read/route";
import { GET as LISTA } from "./route";
import { POST as SYNC } from "./sync/route";

const amb = criarAmbiente();
const { e } = amb;
const UUID = "9b2f6c1e-3d4a-4b5c-8d7e-0a1b2c3d4e5f";

before(() => amb.iniciar());
after(() => amb.parar());
beforeEach(() => amb.zerar());

const todasAsRotasDoId = (): Array<[string, () => Promise<Response>]> => [
  ["PATCH", () => PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, { acao: "resolver" }), comId(CONV_ID))],
  ["GET messages", () => FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages`), comId(CONV_ID))],
  ["POST messages", () => ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "oi", idempotencyKey: UUID }), comId(CONV_ID))],
  ["POST read", () => LIDA(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/read`), comId(CONV_ID))],
  ["GET media", () => MIDIA(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/media?mid=m1&i=0`), comId(CONV_ID))],
];

test("conversa de outra loja é 404 em todo [id], sem gravar nada e sem falar com a Zernio", async () => {
  e.donoDaConversa = "loja-a";
  for (const [nome, chamar] of todasAsRotasDoId()) assert.equal((await chamar()).status, 404, nome);
  assert.deepEqual(amb.escritas(), []);
  assert.equal(amb.pedidosZernio.length, 0);
  const leitura = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_conversations");
  assert.equal(leitura?.url.searchParams.get("tenant_id"), `eq.${LOJA}`, "a leitura filtra a loja da sessão");
});

test("GET [id]: devolve só o id da ficha da loja; outra loja é 404; sem ficha é null; vendedora é 403", async () => {
  const pedir = () => CONTATO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}`), comId(CONV_ID));
  const ok = await pedir();
  assert.equal(ok.status, 200);
  const corpo = await ok.json();
  assert.deepEqual(corpo, { contatoId: "ficha-1" });
  assert.doesNotMatch(JSON.stringify(corpo), /u1/);
  e.ficha = null;
  assert.deepEqual(await (await pedir()).json(), { contatoId: null });
  e.donoDaConversa = "loja-a";
  assert.equal((await pedir()).status, 404);
  e.donoDaConversa = LOJA;
  e.papel = "seller";
  assert.equal((await pedir()).status, 403);
});

test("id que não é uuid é 404 sem ir ao banco", async () => {
  assert.equal((await FIO(amb.pedir("GET", "/api/ig/conversations/x/messages"), comId("x"))).status, 404);
  assert.equal((await PATCH(amb.pedir("PATCH", "/api/ig/conversations/x", { acao: "resolver" }), comId("x"))).status, 404);
  assert.equal(amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/ig_conversations").length, 0);
});

test("vendedora: 403 em todas as rotas; add-on desligado: 403 instagram_disabled", async () => {
  e.papel = "seller";
  for (const [nome, chamar] of todasAsRotasDoId()) assert.equal((await chamar()).status, 403, nome);
  assert.equal((await LISTA(amb.pedir("GET", "/api/ig/conversations"))).status, 403);
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-seller"))).status, 403);
  e.papel = "operator";
  e.ligado = false;
  const r = await LISTA(amb.pedir("GET", "/api/ig/conversations"));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, "instagram_disabled");
  assert.deepEqual(amb.escritas(), []);
  assert.equal(amb.pedidosZernio.length, 0);
});

test("lista: filtros viram consulta da loja, devolve o contador e não vaza o id do Instagram", async () => {
  e.tagIds = ["u1", "u2"];
  e.aguardando = 7;
  const r = await LISTA(amb.pedir("GET", "/api/ig/conversations?status=waiting&naoLidas=1&busca=ana&etiqueta=vip&cursor=50"));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.aguardando, 7);
  assert.equal(corpo.conversas[0].id, CONV_ID);
  assert.equal(corpo.conversas[0].situacao, "waiting");
  assert.doesNotMatch(JSON.stringify(corpo), /u1|z-1|tenant_id|ig_user_id/);
  const lista = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_conversations" && c.metodo === "GET");
  assert.equal(lista?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(lista?.url.searchParams.get("status"), "eq.waiting");
  assert.equal(lista?.url.searchParams.get("unread_count"), "gt.0");
  assert.equal(lista?.url.searchParams.get("ig_user_id"), "in.(u1,u2)");
  const fichas = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_contacts");
  assert.equal(fichas?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(fichas?.url.searchParams.get("tags"), "cs.{vip}");
  const contagem = amb.chamadas.find((c) => c.metodo === "HEAD");
  assert.equal(contagem?.url.searchParams.get("status"), "eq.waiting");
});

test("lista: etiqueta passando do teto avisa que olhou só as mais recentes; filtro inválido é 400", async () => {
  e.tagIds = Array.from({ length: 201 }, (_, i) => `u${i}`);
  const corpo = await (await LISTA(amb.pedir("GET", "/api/ig/conversations?etiqueta=vip"))).json();
  assert.equal(corpo.etiquetaParcial, true);
  for (const ruim of ["?status=qualquer", "?etiqueta=!!", "?cursor=abc", "?busca=" + "x".repeat(61)]) assert.equal((await LISTA(amb.pedir("GET", `/api/ig/conversations${ruim}`))).status, 400, ruim);
});

test("PATCH: resolver zera a pausa; pausar põe 12 h; retomar tira; cada um grava um evento sem texto", async () => {
  const antes = Date.now();
  let r = await PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, { acao: "pausar" }), comId(CONV_ID));
  assert.equal(r.status, 200);
  const ate = Date.parse(e.conversa.bot_paused_until as string);
  assert.ok(Math.abs(ate - (antes + 12 * 3600_000)) < 60_000, "pausa de 12 h");
  assert.equal((await r.json()).conversa.roboPausadoAte, e.conversa.bot_paused_until);
  r = await PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, { acao: "retomar" }), comId(CONV_ID));
  assert.equal(e.conversa.bot_paused_until, null);
  r = await PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, { acao: "resolver" }), comId(CONV_ID));
  assert.equal(e.conversa.status, "resolved");
  const eventos = amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/ig_conversation_events" && c.metodo === "POST").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(eventos.map((x) => [x.kind, x.detail]), [["paused", "pausado_pela_loja"], ["paused", "retomado_pela_loja"], ["resolved", "loja"]]);
  assert.ok(eventos.every((x) => x.tenant_id === LOJA && x.conversation_id === CONV_ID && !("text" in x)));
  assert.equal(amb.pedidosZernio.length, 0);
});

test("PATCH com ação inválida é 400", async () => {
  assert.equal((await PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, { acao: "apagar" }), comId(CONV_ID))).status, 400);
  assert.equal((await PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, {}), comId(CONV_ID))).status, 400);
  assert.deepEqual(amb.escritas(), []);
});

test("GET messages: rótulos Robô/Você pelo id, anexos sem URL da Zernio, marcas e janela calculada no servidor", async () => {
  e.eventos = [
    { id: 1, conversation_id: CONV_ID, kind: "bot_message", zernio_message_id: "m2", run_id: "run-1", detail: "message", occurred_at: horasAtras(3) },
    { id: 2, conversation_id: CONV_ID, kind: "store_message", zernio_message_id: "m3", run_id: null, detail: null, occurred_at: horasAtras(2) },
    { id: 3, conversation_id: CONV_ID, kind: "waiting", zernio_message_id: null, run_id: null, detail: "handoff", occurred_at: horasAtras(2) },
  ];
  e.zernio = () => ({ status: 200, body: { messages: [
    { id: "m4", message: "oi?", direction: "incoming", createdAt: horasAtras(1), attachments: [{ type: "image", mimeType: "image/jpeg", url: "https://scontent.exemplo.com/secreto.jpg", refreshUrl: "https://zernio.com/x" }] },
    { id: "m3", message: "Já vejo", direction: "outgoing", createdAt: horasAtras(2) },
    { id: "m2", message: "Olá!", direction: "outgoing", createdAt: horasAtras(3) },
    { id: "m1", message: "Manual", direction: "outgoing", createdAt: horasAtras(4) },
  ], pagination: { hasMore: true, nextCursor: "proxima" } } });
  const r = await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages?cursor=atual`), comId(CONV_ID));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.deepEqual(corpo.mensagens.map((m: { id: string; autor: string | null }) => [m.id, m.autor]), [["m4", null], ["m3", "voce"], ["m2", "robo"], ["m1", null]]);
  assert.equal(corpo.mensagens[2].runId, "run-1");
  assert.deepEqual(corpo.mensagens[0].anexos, [{ indice: 0, tipo: "image", mime: "image/jpeg", nome: null }]);
  assert.doesNotMatch(JSON.stringify(corpo), /secreto|refreshUrl|zernio\.com/);
  assert.equal(corpo.proximo, "proxima");
  assert.deepEqual(corpo.marcas.map((m: { tipo: string }) => m.tipo), ["waiting"]);
  assert.equal(corpo.janela.estado, "aberta");
  const pedido = amb.pedidosZernio[0];
  assert.equal(pedido.url.pathname, "/api/v1/inbox/conversations/z-1/messages");
  assert.deepEqual([pedido.url.searchParams.get("accountId"), pedido.url.searchParams.get("cursor"), pedido.url.searchParams.get("sortOrder")], ["acc-z", "atual", "desc"]);
  assert.equal(amb.escritas().length, 0, "ficha com data não regrava");
});

test("GET messages: conversa importada (ficha sem last_dm_at) calcula pela última recebida e grava", async () => {
  e.ficha = { ...e.ficha, last_dm_at: null };
  e.zernio = () => ({ status: 200, body: { messages: [{ id: "m2", message: "a", direction: "outgoing", createdAt: horasAtras(1) }, { id: "m1", message: "b", direction: "incoming", createdAt: horasAtras(30) }], pagination: { hasMore: false } } });
  const corpo = await (await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages`), comId(CONV_ID))).json();
  assert.equal(corpo.janela.estado, "humano");
  const apply = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/ig_contact_apply");
  assert.deepEqual([(apply?.corpo as Record<string, unknown>).p_dm, (apply?.corpo as Record<string, unknown>).p_seen_at, (apply?.corpo as Record<string, unknown>).p_tenant], [true, horasAtras(30), LOJA]);
});

test("GET messages: erro 429 da Zernio vira 429 com Retry-After; 404 dela vira 404", async () => {
  e.zernio = () => ({ status: 429, body: { error: "slow" }, headers: { "Retry-After": "12" } });
  const r = await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages`), comId(CONV_ID));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "12");
  e.zernio = () => ({ status: 404, body: {} });
  assert.equal((await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages`), comId(CONV_ID))).status, 404);
});

test("POST messages dentro de 24 h: sem tag; pausa 12 h, grava o evento, zera não lidas e encerra o run que esperava", async () => {
  e.zernio = () => ({ status: 200, body: { success: true, data: { messageId: "mid-9" } } });
  const r = await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "  Oi, tudo bem?  ", idempotencyKey: UUID }), comId(CONV_ID));
  assert.equal(r.status, 200);
  const envio = amb.pedidosZernio[0];
  assert.equal(envio.url.pathname, "/api/v1/inbox/conversations/z-1/messages");
  assert.deepEqual(envio.corpo, { accountId: "acc-z", message: "Oi, tudo bem?" });
  assert.equal(envio.headers["idempotency-key"], chaveDeEnvio(LOJA, CONV_ID, UUID, assinaturaDeEnvio("texto", { texto: "Oi, tudo bem?" })));
  assert.notEqual(envio.headers["idempotency-key"], UUID);
  const evento = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_conversation_events" && c.metodo === "POST")?.corpo as Record<string, unknown>;
  assert.deepEqual([evento.kind, evento.zernio_message_id, evento.conversation_id, evento.tenant_id], ["store_message", "mid-9", CONV_ID, LOJA]);
  const touch = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/ig_conversation_touch")?.corpo as Record<string, unknown>;
  assert.deepEqual([touch.p_direction, touch.p_status, touch.p_preview], ["out", "open", "Oi, tudo bem?"]);
  const pausa = Date.parse(e.conversa.bot_paused_until as string);
  assert.ok(Math.abs(pausa - (Date.now() + 12 * 3600_000)) < 60_000);
  assert.equal(e.conversa.unread_count, 0);
  const runs = amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/ig_runs" && c.metodo === "PATCH");
  assert.equal(runs.length, 2, "pelo id e pelo @");
  assert.equal(runs[0].url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(runs[0].url.searchParams.get("waiting"), "eq.reply");
  assert.deepEqual([(runs[0].corpo as Record<string, unknown>).status, (runs[0].corpo as Record<string, unknown>).error_code], ["stopped", "replied_by_store"]);
});

test("POST messages entre 24 h e 7 dias: leva MESSAGE_TAG + HUMAN_AGENT", async () => {
  e.ficha = { ...e.ficha, last_dm_at: horasAtras(30) };
  const r = await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "Oi", idempotencyKey: UUID }), comId(CONV_ID));
  assert.equal(r.status, 200);
  assert.deepEqual(amb.pedidosZernio[0].corpo, { accountId: "acc-z", message: "Oi", messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" });
});

test("POST messages depois de 7 dias ou sem data: 409 janela_fechada, sem Zernio e sem gravar", async () => {
  for (const ultima of [horasAtras(24 * 7 + 1), null]) {
    amb.chamadas.length = 0;
    e.ficha = { ...e.ficha, last_dm_at: ultima };
    const r = await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "Oi", idempotencyKey: UUID }), comId(CONV_ID));
    assert.equal(r.status, 409);
    assert.equal((await r.json()).code, "janela_fechada");
    assert.deepEqual(amb.escritas(), []);
  }
  assert.equal(amb.pedidosZernio.length, 0);
});

test("POST messages: corpo inválido é 400 (texto vazio ou longo, chave que não é uuid)", async () => {
  for (const corpo of [{ texto: "   ", idempotencyKey: UUID }, { texto: "x".repeat(1001), idempotencyKey: UUID }, { texto: "oi", idempotencyKey: "abc" }, { texto: "oi" }]) {
    assert.equal((await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, corpo), comId(CONV_ID))).status, 400);
  }
  assert.equal(amb.pedidosZernio.length, 0);
});

test("POST messages: a Zernio recusar não grava nada na Girumo", async () => {
  e.zernio = () => ({ status: 422, body: { error: "attachment_fetch_failed", code: "x" } });
  const r = await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "oi", idempotencyKey: UUID }), comId(CONV_ID));
  assert.equal(r.status, 422);
  assert.doesNotMatch(JSON.stringify(await r.json()), /attachment_fetch_failed/);
  assert.deepEqual(amb.escritas(), []);
});

test("conta trocada ou desconectada: 409, sem falar com a Zernio", async () => {
  e.conta = { ...e.conta, id: "outra-conta" };
  const r = await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages`), comId(CONV_ID));
  assert.equal((await r.json()).code, "conta_trocada");
  e.conta = { ...e.conta, id: "conta-1", status: "disconnected" };
  assert.equal((await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages`), comId(CONV_ID))).status, 409);
  assert.equal(amb.pedidosZernio.length, 0);
});

test("read: com não lidas zera e avisa a Zernio; a falha dela não desfaz o zero; sem não lidas nem chama", async () => {
  e.zernio = () => ({ status: 500, body: {} });
  const r = await LIDA(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/read`), comId(CONV_ID));
  assert.equal(r.status, 200);
  assert.equal(e.conversa.unread_count, 0);
  assert.deepEqual([amb.pedidosZernio[0].url.pathname, amb.pedidosZernio[0].corpo], ["/api/v1/inbox/conversations/z-1/read", { accountId: "acc-z" }]);
  amb.pedidosZernio.length = 0;
  assert.equal((await LIDA(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/read`), comId(CONV_ID))).status, 200);
  assert.equal(amb.pedidosZernio.length, 0);
});

test("mídia: 302 para o link novo, sem passar bytes; mid e i inválidos são 400", async () => {
  e.zernio = () => ({ status: 200, body: { url: "https://scontent.exemplo.com/novo.jpg?sig=1" } });
  const r = await MIDIA(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/media?mid=aWdf-1&i=1`), comId(CONV_ID));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://scontent.exemplo.com/novo.jpg?sig=1");
  assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(r.body, null);
  const pedido = amb.pedidosZernio[0];
  assert.equal(pedido.url.pathname, "/api/v1/inbox/conversations/z-1/messages/aWdf-1/attachments/1");
  assert.deepEqual([pedido.url.searchParams.get("format"), pedido.url.searchParams.get("accountId")], ["json", "acc-z"]);
  amb.pedidosZernio.length = 0;
  for (const q of ["", "?mid=a&i=x", "?mid=a/b&i=0", "?i=0", "?mid=a&i=20", "?mid=a&i=-1"]) assert.equal((await MIDIA(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/media${q}`), comId(CONV_ID))).status, 400, q);
  assert.equal(amb.pedidosZernio.length, 0);
});

test("mídia: link que não é https vira 502 e não redireciona", async () => {
  e.zernio = () => ({ status: 200, body: { url: "http://interno/x" } });
  const r = await MIDIA(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/media?mid=a&i=0`), comId(CONV_ID));
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("location"), null);
});

const zernioComConversas = (n: number, extra: Record<string, unknown> = {}) => (): ReturnType<typeof e.zernio> => ({
  status: 200,
  body: { data: Array.from({ length: n }, (_, i) => ({ id: `z-novo-${i}`, participantId: `p${i}`, participantName: `Pessoa ${i}`, lastMessage: "oi", updatedTime: i === 0 ? horasAtras(2) : horasAtras(48), unreadCount: 3, ...extra })), pagination: { hasMore: false } },
});

test("sync: cria índice e ficha de cada conversa, sem somar não lidas, Aberta se recente e Resolvida se antiga", async () => {
  e.donoDaConversa = "loja-sync-1";
  e.zernio = zernioComConversas(2);
  const r = await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-1"));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { criadas: 2, existentes: 0, puladas: 0, parcial: false });
  const pedido = amb.pedidosZernio[0];
  assert.deepEqual([pedido.url.pathname, pedido.url.searchParams.get("accountId"), pedido.url.searchParams.get("limit"), pedido.url.searchParams.has("folder")], ["/api/v1/inbox/conversations", "acc-z", "100", false]);
  const toques = amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/ig_conversation_touch").map((c) => c.corpo as Record<string, unknown>);
  assert.ok(toques.every((t) => t.p_tenant === "loja-sync-1" && t.p_direction === "in" && t.p_status === null), "o touch não decide a situação: quem decide é o acerto condicional");
  assert.deepEqual(toques.map((t) => t.p_ig_user_id).sort(), ["p0", "p1"]);
  const acertos = amb.chamadas.filter((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/ig_conversations");
  assert.deepEqual(acertos.map((z) => z.corpo as Record<string, unknown>).map((b) => [b.status, b.unread_count]).sort(), [["open", 0], ["resolved", 0]]);
  assert.ok(acertos.every((z) => /^lte\./.test(z.url.searchParams.get("last_message_at") ?? "") && z.url.searchParams.get("tenant_id") === "eq.loja-sync-1"), "só se não chegou mensagem mais nova");
  const fichas = amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/ig_contact_apply").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(fichas.length, 2);
  assert.ok(fichas.every((f) => f.p_dm === false), "sem p_dm: last_dm_at fica vazio");
});

test("sync: pula quem a loja apagou (marcador) e quem já está no índice; não recria", async () => {
  e.donoDaConversa = "loja-sync-2";
  e.zernio = zernioComConversas(3);
  e.tombstones.add(tombstoneHash("loja-sync-2", "p0"));
  e.existentesNoIndice.add("z-novo-1");
  const corpo = await (await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-2"))).json();
  assert.deepEqual(corpo, { criadas: 1, existentes: 1, puladas: 1, parcial: false });
  const toques = amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/ig_conversation_touch");
  assert.deepEqual(toques.map((t) => (t.corpo as Record<string, unknown>).p_ig_user_id), ["p2"]);
});

test("sync: segunda varredura em menos de 2 minutos da mesma loja é 429; outra loja passa", async () => {
  e.donoDaConversa = "loja-sync-3";
  e.zernio = zernioComConversas(0);
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-3"))).status, 200);
  const r = await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-3"));
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "120");
  assert.equal(amb.pedidosZernio.length, 2, "a segunda só leu a 1ª página (o portão de 2 min vem depois dela) e não importou nada");
  assert.equal(amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/ig_conversation_touch").length, 0);
  e.donoDaConversa = "loja-sync-4";
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-4"))).status, 200);
});

test("sync sem conta conectada é 409 e não gasta a espera de 2 minutos", async () => {
  e.donoDaConversa = "loja-sync-5";
  e.conta = null;
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-5"))).status, 409);
  e.conta = { id: "conta-1", status: "active", provider_account_id: "acc-z" };
  e.zernio = zernioComConversas(0);
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-5"))).status, 200);
});

test("sync: falha na primeira página não gasta a espera de 2 minutos", async () => {
  e.donoDaConversa = "loja-sync-6";
  e.zernio = () => ({ status: 503, body: {} });
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-6"))).status, 502);
  e.zernio = zernioComConversas(0);
  assert.equal((await SYNC(amb.pedir("POST", "/api/ig/conversations/sync", undefined, "loja-sync-6"))).status, 200);
});

test("POST messages: a mensagem saiu, então falha ao gravar vira 200 com registroParcial; pausa e espera vêm antes do registro", async () => {
  e.runsFalha = true;
  e.eventoFalha = true;
  e.zernio = () => ({ status: 200, body: { data: { messageId: "mid-7" } } });
  const r = await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "oi", idempotencyKey: UUID }), comId(CONV_ID));
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.deepEqual([corpo.ok, corpo.messageId, corpo.registroParcial], [true, "mid-7", true]);
  const ordem = amb.chamadas.map((c) => `${c.metodo} ${c.url.pathname}`);
  const pausa = ordem.findIndex((x) => x === "PATCH /rest/v1/ig_conversations");
  const evento = ordem.findIndex((x) => x === "POST /rest/v1/ig_conversation_events");
  assert.ok(pausa >= 0 && evento > pausa && ordem.findIndex((x) => x === "PATCH /rest/v1/ig_runs") < evento, ordem.join(" | "));
  assert.ok(e.conversa.bot_paused_until, "a pausa gravou mesmo com o run falhando");
});

test("POST messages: encerrar a espera que falha uma vez é repetido e a proteção fica completa", async () => {
  e.runsFalha = 1;
  e.zernio = () => ({ status: 200, body: { data: { messageId: "mid-9" } } });
  const corpo = await (await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "oi", idempotencyKey: UUID }), comId(CONV_ID))).json();
  assert.equal(corpo.registroParcial, undefined);
  assert.equal(amb.chamadas.filter((c) => `${c.metodo} ${c.url.pathname}` === "PATCH /rest/v1/ig_runs").length >= 2, true);
});

test("POST messages sem falha não traz registroParcial", async () => {
  e.zernio = () => ({ status: 200, body: { data: { messageId: "mid-8" } } });
  const corpo = await (await ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, { texto: "oi", idempotencyKey: UUID }), comId(CONV_ID))).json();
  assert.equal(corpo.registroParcial, undefined);
});

test("PATCH: falha ao gravar o evento depois de mudar a conversa não vira 500; responde o estado novo", async () => {
  e.eventoFalha = true;
  const r = await PATCH(amb.pedir("PATCH", `/api/ig/conversations/${CONV_ID}`, { acao: "resolver" }), comId(CONV_ID));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).conversa.situacao, "resolved");
});

test("GET messages: cursor gigante é 400 sem falar com a Zernio", async () => {
  const r = await FIO(amb.pedir("GET", `/api/ig/conversations/${CONV_ID}/messages?cursor=${"a".repeat(513)}`), comId(CONV_ID));
  assert.equal(r.status, 400);
  assert.equal(amb.pedidosZernio.length, 0);
});
