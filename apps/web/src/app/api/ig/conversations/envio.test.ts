import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { chaveDeEnvio } from "@/lib/ig/conversas/fio";
import { comId, CONV_ID, criarAmbiente, horasAtras } from "@/test/ig-conversas-fake";
import { POST as CONVIDAR } from "./[id]/invite/route";
import { POST as ENVIAR } from "./[id]/messages/route";

/**
 * Foto/vídeo e convite pelo chat. O Supabase falso das Conversas não conhece `uploads`, o Storage nem `campaign_groups`:
 * este arquivo responde esses três na frente dele e entrega o resto ao falso.
 */

const amb = criarAmbiente();
const { e } = amb;
const LOJA = "7a1d2c3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d";
const OUTRA = "0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b";
const CAMPANHA = "5c4b3a29-1807-4f6e-9d5c-4b3a29180716";
const UUID = "9b2f6c1e-3d4a-4b5c-8d7e-0a1b2c3d4e5f";
const TOKEN = "tok-secreto-de-leitura";

const idDaMidia = (tenant: string, arquivo = "5d4c3b2a-1908-4a7b-8c6d-5e4f3a2b1c0d.png") => Buffer.from(`${tenant}/media/${arquivo}`, "utf8").toString("base64url");

type Upload = { tenant: string; path: string; mime: string; size: number; kind: string };
let uploads: Upload[] = [];
let campanhas: Array<{ id: string; tenant_id: string; slug: string }> = [];
let uploadsLidos: URL[] = [];
let campanhasLidas: URL[] = [];
let assinaturas: number[] = [];
let fetchDoAmbiente: typeof fetch;

before(async () => {
  await amb.iniciar();
  fetchDoAmbiente = globalThis.fetch;
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/rest/v1/uploads") {
      uploadsLidos.push(url);
      const tenant = url.searchParams.get("tenant_id")?.replace(/^eq\./, "");
      const caminho = url.searchParams.get("path")?.replace(/^eq\./, "");
      return json(uploads.filter((u) => u.tenant === tenant && `uploads/${u.path}` === caminho && `eq.${u.kind}` === url.searchParams.get("kind")).map((u) => ({ mime_type: u.mime, size: u.size })));
    }
    if (url.pathname === "/rest/v1/campaign_groups") {
      campanhasLidas.push(url);
      return json(campanhas.filter((c) => `eq.${c.tenant_id}` === url.searchParams.get("tenant_id") && `eq.${c.id}` === url.searchParams.get("id")));
    }
    if (url.pathname === "/rest/v1/custom_domains") return json([]);
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      assinaturas.push(JSON.parse(String(init?.body)).expiresIn);
      return json({ signedURL: `/object/sign/uploads/arquivo.png?token=${TOKEN}` });
    }
    return fetchDoAmbiente(entrada, init);
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = fetchDoAmbiente;
  amb.parar();
});
beforeEach(() => {
  amb.zerar();
  e.donoDaConversa = LOJA;
  e.conversa = { ...e.conversa, tenant_id: LOJA };
  e.ficha = { ...e.ficha, tenant_id: LOJA };
  e.zernio = () => ({ status: 200, body: { success: true, data: { messageId: "mid-a", messageIds: ["mid-a", "mid-t"] } } });
  uploads = [{ tenant: LOJA, path: `${LOJA}/media/5d4c3b2a-1908-4a7b-8c6d-5e4f3a2b1c0d.png`, mime: "image/png", size: 500_000, kind: "media" }];
  campanhas = [{ id: CAMPANHA, tenant_id: LOJA, slug: "vip-moda" }];
  uploadsLidos = [];
  campanhasLidas = [];
  assinaturas = [];
});

const enviar = (corpo: unknown) => ENVIAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/messages`, corpo, LOJA), comId(CONV_ID));
const convidar = (corpo: unknown) => CONVIDAR(amb.pedir("POST", `/api/ig/conversations/${CONV_ID}/invite`, corpo, LOJA), comId(CONV_ID));
const eventos = () => amb.chamadas.filter((c) => c.url.pathname === "/rest/v1/ig_conversation_events" && c.metodo === "POST").map((c) => c.corpo as Record<string, unknown>);

test("mídia que não é da loja é 404: id de outra loja nem chega ao banco; id da loja sem linha em uploads também", async () => {
  const deOutra = await enviar({ midiaId: idDaMidia(OUTRA), idempotencyKey: UUID });
  assert.equal(deOutra.status, 404);
  assert.equal(uploadsLidos.length, 0, "o caminho já diz que é de outra loja");
  uploads = [];
  const semLinha = await enviar({ midiaId: idDaMidia(LOJA), idempotencyKey: UUID });
  assert.equal(semLinha.status, 404);
  assert.equal(uploadsLidos[0].searchParams.get("tenant_id"), `eq.${LOJA}`, "a leitura filtra a loja da sessão");
  assert.equal(amb.pedidosZernio.length, 0);
  assert.equal(assinaturas.length, 0);
  assert.deepEqual(amb.escritas(), []);
});

test("mídia que não é do tipo `media` (outra finalidade) não sai por aqui", async () => {
  uploads = [{ ...uploads[0], kind: "lp-media" }];
  assert.equal((await enviar({ midiaId: idDaMidia(LOJA), idempotencyKey: UUID })).status, 404);
});

test("tipo ou tamanho fora do limite do Instagram é 400, conferido de novo no servidor", async () => {
  for (const [mime, size] of [["image/webp", 1000], ["image/png", 8_000_001], ["video/mp4", 25_000_001], ["video/quicktime", 1000], ["audio/mpeg", 1000]] as const) {
    uploads = [{ ...uploads[0], mime, size }];
    const r = await enviar({ midiaId: idDaMidia(LOJA), idempotencyKey: UUID });
    assert.equal(r.status, 400, `${mime} ${size}`);
    assert.equal((await r.json()).code, "anexo_invalido");
  }
  assert.equal(amb.pedidosZernio.length, 0);
  assert.deepEqual(amb.escritas(), []);
});

test("janela fechada com mídia é 409, sem assinar link, sem Zernio e sem gravar", async () => {
  e.ficha = { ...e.ficha, last_dm_at: horasAtras(24 * 7 + 1) };
  const r = await enviar({ midiaId: idDaMidia(LOJA), idempotencyKey: UUID });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "janela_fechada");
  assert.equal(assinaturas.length, 0);
  assert.equal(amb.pedidosZernio.length, 0);
  assert.deepEqual(amb.escritas(), []);
});

test("sem texto e sem mídia é 400", async () => {
  for (const corpo of [{ idempotencyKey: UUID }, { texto: "   ", idempotencyKey: UUID }, { texto: "", midiaId: "", idempotencyKey: UUID }]) assert.equal((await enviar(corpo)).status, 400);
  assert.equal(amb.pedidosZernio.length, 0);
});

test("texto + foto: um envio com link assinado curto, dois eventos Você, pausa e sem o link na resposta", async () => {
  const r = await enviar({ texto: "  Olha a peça  ", midiaId: idDaMidia(LOJA), idempotencyKey: UUID });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.deepEqual([corpo.messageId, corpo.messageIds], ["mid-a", ["mid-a", "mid-t"]]);
  assert.doesNotMatch(JSON.stringify(corpo), new RegExp(TOKEN), "o link assinado não volta ao navegador");
  assert.equal(amb.pedidosZernio.length, 1);
  const envio = amb.pedidosZernio[0];
  const c = envio.corpo as Record<string, string>;
  assert.deepEqual([c.accountId, c.attachmentType, c.message], ["acc-z", "image", "Olha a peça"]);
  assert.match(c.attachmentUrl, new RegExp(`^http://127\\.0\\.0\\.1:\\d+/storage/v1/object/sign/uploads/arquivo\\.png\\?token=${TOKEN}$`));
  assert.equal(envio.headers["idempotency-key"], chaveDeEnvio(LOJA, CONV_ID, UUID));
  assert.ok(assinaturas[0] >= 300 && assinaturas[0] <= 600, `link de 5 a 10 min, veio ${assinaturas[0]} s`);
  assert.deepEqual(eventos().map((x) => [x.kind, x.zernio_message_id, x.tenant_id]), [["store_message", "mid-a", LOJA], ["store_message", "mid-t", LOJA]]);
  const touch = amb.chamadas.find((x) => x.url.pathname === "/rest/v1/rpc/ig_conversation_touch")?.corpo as Record<string, unknown>;
  assert.equal(touch.p_preview, "Olha a peça");
  assert.ok(Math.abs(Date.parse(e.conversa.bot_paused_until as string) - (Date.now() + 12 * 3600_000)) < 60_000);
  assert.equal(amb.chamadas.filter((x) => x.url.pathname === "/rest/v1/ig_runs" && x.metodo === "PATCH").length, 2, "encerra a espera");
});

test("só vídeo: vai como video, sem message, um evento, e a prévia da lista diz Vídeo", async () => {
  uploads = [{ ...uploads[0], path: `${LOJA}/media/5d4c3b2a-1908-4a7b-8c6d-5e4f3a2b1c0d.mp4`, mime: "video/mp4", size: 20_000_000 }];
  e.zernio = () => ({ status: 200, body: { success: true, data: { messageId: "mid-v" } } });
  const r = await enviar({ midiaId: idDaMidia(LOJA, "5d4c3b2a-1908-4a7b-8c6d-5e4f3a2b1c0d.mp4"), idempotencyKey: UUID });
  assert.equal(r.status, 200);
  const c = amb.pedidosZernio[0].corpo as Record<string, unknown>;
  assert.equal(c.attachmentType, "video");
  assert.equal("message" in c, false);
  assert.deepEqual(eventos().map((x) => x.zernio_message_id), ["mid-v"]);
  assert.equal((amb.chamadas.find((x) => x.url.pathname === "/rest/v1/rpc/ig_conversation_touch")?.corpo as Record<string, unknown>).p_preview, "Vídeo");
});

test("entre 24 h e 7 dias a foto vai como atendimento humano", async () => {
  e.ficha = { ...e.ficha, last_dm_at: horasAtras(30) };
  await enviar({ midiaId: idDaMidia(LOJA), idempotencyKey: UUID });
  const c = amb.pedidosZernio[0].corpo as Record<string, unknown>;
  assert.deepEqual([c.messagingType, c.messageTag], ["MESSAGE_TAG", "HUMAN_AGENT"]);
});

test("a Zernio não baixar o anexo (422 attachment_fetch_failed) vira erro legível e não grava nada", async () => {
  e.zernio = () => ({ status: 422, body: { error: "fetch", type: "validation_error", code: "attachment_fetch_failed" } });
  const r = await enviar({ midiaId: idDaMidia(LOJA), idempotencyKey: UUID });
  assert.equal(r.status, 422);
  const corpo = await r.json();
  assert.equal(corpo.code, "anexo_inacessivel");
  assert.match(corpo.error, /não conseguiu baixar o arquivo/);
  assert.doesNotMatch(JSON.stringify(corpo), new RegExp(TOKEN));
  assert.deepEqual(amb.escritas(), []);
});

test("convite de campanha de outra loja ou que não existe é 404, filtrando a loja, sem Zernio", async () => {
  campanhas = [{ id: CAMPANHA, tenant_id: OUTRA, slug: "vip-alheio" }];
  const r = await convidar({ campanhaId: CAMPANHA, idempotencyKey: UUID });
  assert.equal(r.status, 404);
  assert.equal(campanhasLidas[0].searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(amb.pedidosZernio.length, 0);
  assert.deepEqual(amb.escritas(), []);
  assert.equal((await convidar({ campanhaId: "nao-e-uuid", idempotencyKey: UUID })).status, 400);
});

test("convite com a janela fechada é 409 e não manda nada", async () => {
  e.ficha = { ...e.ficha, last_dm_at: horasAtras(24 * 7 + 1) };
  const r = await convidar({ campanhaId: CAMPANHA, idempotencyKey: UUID });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "janela_fechada");
  assert.equal(amb.pedidosZernio.length, 0);
  assert.deepEqual(amb.escritas(), []);
});

test("convite entre 24 h e 7 dias vai como atendimento humano", async () => {
  e.ficha = { ...e.ficha, last_dm_at: horasAtras(30) };
  e.zernio = () => ({ status: 200, body: { success: true, data: { messageId: "mid-c" } } });
  assert.equal((await convidar({ campanhaId: CAMPANHA, idempotencyKey: UUID })).status, 200);
  const c = amb.pedidosZernio[0].corpo as Record<string, unknown>;
  assert.deepEqual([c.messagingType, c.messageTag], ["MESSAGE_TAG", "HUMAN_AGENT"]);
});

test("convite: texto curto com botão de URL do link puro da campanha, evento Você, pausa de 12 h e espera encerrada", async () => {
  e.zernio = () => ({ status: 200, body: { success: true, data: { messageId: "mid-c" } } });
  const r = await convidar({ campanhaId: CAMPANHA, idempotencyKey: UUID });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).messageId, "mid-c");
  const c = amb.pedidosZernio[0].corpo as { message: string; buttons: Array<{ type: string; title: string; url: string }> };
  assert.equal(amb.pedidosZernio[0].url.pathname, "/api/v1/inbox/conversations/z-1/messages");
  assert.ok(c.message.length > 0 && c.message.length <= 640);
  assert.equal(c.buttons.length, 1);
  assert.deepEqual([c.buttons[0].type, c.buttons[0].title], ["url", "Entrar no grupo VIP"]);
  assert.match(c.buttons[0].url, /\/r\/vip-moda$/, "o link da campanha sem ?ig=");
  assert.equal(c.buttons[0].url.includes("ig="), false);
  assert.equal(amb.pedidosZernio[0].headers["idempotency-key"], chaveDeEnvio(LOJA, CONV_ID, UUID));
  assert.deepEqual(eventos().map((x) => [x.kind, x.zernio_message_id]), [["store_message", "mid-c"]]);
  assert.ok(Math.abs(Date.parse(e.conversa.bot_paused_until as string) - (Date.now() + 12 * 3600_000)) < 60_000);
  assert.equal(amb.chamadas.filter((x) => x.url.pathname === "/rest/v1/ig_runs" && x.metodo === "PATCH").length, 2);
});

test("convite: vendedora é 403 e conversa de outra loja é 404", async () => {
  e.papel = "seller";
  assert.equal((await convidar({ campanhaId: CAMPANHA, idempotencyKey: UUID })).status, 403);
  e.papel = "owner";
  e.donoDaConversa = OUTRA;
  assert.equal((await convidar({ campanhaId: CAMPANHA, idempotencyKey: UUID })).status, 404);
  assert.equal(amb.pedidosZernio.length, 0);
});
