import assert from "node:assert/strict";
import { test } from "node:test";
import { chaveDeEnvio, decidirEnvio, lerAnexo, linkDeAnexoSeguro, marcasDoFio, pausaAte, rotulosPorMensagem, ultimaDela } from "./fio";
import type { ConversationEventRow } from "@/lib/stores/ig-conversations";

const AGORA = new Date("2026-11-05T12:00:00Z");
const horas = (n: number) => new Date(AGORA.getTime() - n * 3600_000).toISOString();

test("envio: até 24 h normal, 24 h a 7 dias com a tag, depois (ou sem data) fechado", () => {
  assert.deepEqual(decidirEnvio(horas(2), AGORA), { ok: true, humanAgent: false });
  assert.deepEqual(decidirEnvio(horas(30), AGORA), { ok: true, humanAgent: true });
  assert.deepEqual(decidirEnvio(horas(24 * 7 + 1), AGORA), { ok: false });
  assert.deepEqual(decidirEnvio(null, AGORA), { ok: false });
});

test("pausa de 12 h a partir de agora", () => {
  assert.equal(pausaAte(AGORA), "2026-11-06T00:00:00.000Z");
});

const ev = (kind: ConversationEventRow["kind"], mid: string | null, extra: Partial<ConversationEventRow> = {}): ConversationEventRow => ({ id: 1, conversation_id: "c", kind, zernio_message_id: mid, run_id: null, detail: null, occurred_at: horas(1), ...extra });

test("rótulos: bot_message vira Robô com o run, store_message vira Você, o resto nada", () => {
  const mapa = rotulosPorMensagem([ev("bot_message", "m1", { run_id: "r1" }), ev("store_message", "m2"), ev("waiting", null)]);
  assert.deepEqual(mapa.get("m1"), { autor: "robo", runId: "r1" });
  assert.deepEqual(mapa.get("m2"), { autor: "voce", runId: null });
  assert.equal(mapa.size, 2);
});

test("marcas do fio: só waiting, paused e resolved, com o motivo", () => {
  const marcas = marcasDoFio([ev("bot_message", "m1"), ev("paused", null, { detail: "loja" }), ev("resolved", null)]);
  assert.deepEqual(marcas.map((m) => [m.tipo, m.motivo]), [["paused", "loja"], ["resolved", null]]);
});

test("última mensagem dela: a mais recente incoming; sem nenhuma, null", () => {
  assert.equal(ultimaDela([{ direction: "outgoing", createdAt: horas(1) }, { direction: "incoming", createdAt: horas(5) }, { direction: "incoming", createdAt: horas(9) }]), horas(5));
  assert.equal(ultimaDela([{ direction: "outgoing", createdAt: horas(1) }]), null);
});

test("anexo: mid e índice validados", () => {
  assert.deepEqual(lerAnexo("aWdf-Z_1=", "0"), { mid: "aWdf-Z_1=", indice: 0 });
  for (const [mid, i] of [["..", "0"], [".", "0"], [".x", "0"], ["a".repeat(401), "0"], [null, "0"], ["", "0"], ["a/b", "0"], ["a b", "0"], ["x", null], ["x", "-1"], ["x", "1.5"], ["x", "20"], ["x", "abc"]] as const) assert.equal(lerAnexo(mid, i), null, `${mid} ${i}`);
});

test("link do anexo: só https com nome de host de verdade", () => {
  assert.equal(linkDeAnexoSeguro("https://scontent.cdninstagram.com/v/x.jpg?sig=1"), true);
  for (const ruim of ["http://cdn.exemplo.com/x", "javascript:alert(1)", "https://u:p@cdn.exemplo.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://intranet/x", "https://[::1]/x", "nao-e-url"]) assert.equal(linkDeAnexoSeguro(ruim), false, ruim);
});

test("chave de envio: UUID derivado da loja, da conversa e da chave do navegador (não repassa a crua)", () => {
  const u = "9b2f6c1e-3d4a-4b5c-8d7e-0a1b2c3d4e5f";
  const a = chaveDeEnvio("loja-a", "c1", u);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(a, u);
  assert.equal(a, chaveDeEnvio("loja-a", "c1", u), "estável: o reenvio repete a chave");
  assert.notEqual(a, chaveDeEnvio("loja-b", "c1", u));
  assert.notEqual(a, chaveDeEnvio("loja-a", "c2", u));
});
