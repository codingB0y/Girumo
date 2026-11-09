import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Trava das fixtures da Fase 0 (`docs/superpowers/plans/_recuperar-fase-0-resultado.md`): cada teste leva o nome
 * da suposição do plano 6 que ele confere. Se a Yampi mudar e alguém trocar a fixture, o desenho cai aqui primeiro.
 * Cast local: é teste de fixture, não código de produção.
 */

const DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const ler = (nome: string) => JSON.parse(readFileSync(join(DIR, nome), "utf8")) as Record<string, unknown>;

const CINCO = ["cart.reminder", "order.created", "order.paid", "order.status.updated", "transaction.payment.refused"];
// Só os dois avisos que a Fase 0 guardou: order.paid e order.status.updated chegaram com a assinatura certa (Y9),
// mas o corpo de cliente real não foi salvo, e o Pix de teste não foi pago (Y15).
const AVISOS = ["aviso-order-created.json", "aviso-cart-reminder.json"];

test("S1/S9/S10 envelope: objeto único com event, merchant.alias e resource; alias na regra; corpo abaixo de 1 MiB", () => {
  for (const arquivo of AVISOS) {
    const aviso = ler(arquivo);
    assert.ok(!Array.isArray(aviso), arquivo);
    assert.ok(CINCO.includes(String(aviso.event)), `${arquivo}: ${String(aviso.event)}`);
    assert.match(String((aviso.merchant as { alias?: unknown }).alias), /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}$/, arquivo);
    assert.ok("resource" in aviso, arquivo);
    assert.ok(statSync(join(DIR, arquivo)).size < 1024 * 1024, arquivo);
  }
});

test("S2 o cabeçalho da assinatura é base64 padrão de 32 bytes", () => {
  assert.match(String(ler("cabecalhos-do-aviso.json")["x-yampi-hmac-sha256"]), /^[A-Za-z0-9+/]{43}=$/);
});

test("S3 o POST /webhooks devolve data.id e data.secret_key", () => {
  const data = ler("webhook-criado.json").data as { id: unknown; secret_key: unknown };
  assert.ok(["string", "number"].includes(typeof data.id));
  assert.ok(typeof data.secret_key === "string" && data.secret_key.length >= 16);
});

// A Yampi ecoa os eventos como { data: [{ name }] } (Y8), não como lista de texto.
test("S3b o POST ecoa os cinco eventos em events.data[].name", (t) => {
  const events = (ler("webhook-criado.json").data as { events?: { data?: Array<{ name?: unknown }> } }).events;
  if (!Array.isArray(events?.data)) return t.skip("sem eco: conferir os cinco eventos na linha Y8 do resultado da Fase 0");
  const nomes = events.data.map((e) => e.name);
  for (const e of CINCO) assert.ok(nomes.includes(e), e);
});

const desativado = (w: Record<string, unknown>) => w.active === false || Boolean(w.disabled_at);

test("S4 o GET /webhooks lista id e url, e o aviso ativo não aparece como desativado", () => {
  const lista = ler("webhooks-lista.json").data as Array<Record<string, unknown>>;
  assert.ok(lista.length >= 1 && lista.every((w) => "id" in w && typeof w.url === "string"));
  assert.ok(lista.some((w) => !desativado(w)));
});

test("S4b o aviso desativado aparece com active false ou disabled_at (arquivo próprio da Fase 0)", (t) => {
  if (!existsSync(join(DIR, "webhooks-lista-desativado.json"))) return t.skip("a Yampi não desativa por API (Y20): o desativado fica pela doc");
  const lista = ler("webhooks-lista-desativado.json").data as Array<Record<string, unknown>>;
  assert.ok(lista.some(desativado));
});

// Y16: a Yampi não mandou cabeçalho de limite. O cliente (PR 6b) segue lendo X-RateLimit-Remaining e Retry-After
// como a doc promete; sem eles, só o 429 e o teto por loja seguram. Se um dia a fixture vier com o cabeçalho, ele
// tem de ser número.
test("S5 cabeçalho de limite: ausente na Fase 0 (Y16); quando vier, é número", () => {
  const limite = ler("limite-cabecalhos.json");
  if (!("x-ratelimit-remaining" in limite)) return assert.deepEqual(limite, {});
  assert.match(String(limite["x-ratelimit-remaining"]), /^\d+$/);
});

test("S6/S7/S8 leitura barata, 401 e formato das credenciais", () => {
  assert.ok(Array.isArray(ler("pedidos-1.json").data));
  assert.equal(ler("erro-401.json").status, 401);
  const f = ler("credenciais-formato.json") as Record<string, { tamanho: number; soImprimivelAscii: boolean; temArroba: boolean }>;
  for (const campo of ["userToken", "userSecretKey"]) {
    assert.ok(f[campo].tamanho >= 16 && f[campo].tamanho <= 300 && f[campo].soImprimivelAscii && !f[campo].temArroba, campo);
  }
});
