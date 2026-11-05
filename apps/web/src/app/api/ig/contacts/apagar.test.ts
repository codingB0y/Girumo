import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { tombstoneHash } from "@/lib/ig/conversas/situacao";
import { comId, criarAmbiente, LOJA } from "@/test/ig-conversas-fake";
import { DELETE } from "./[id]/route";

/** "Apagar da lista" com o plano 2: índice de conversas, marcador e a cópia da conversa na Zernio. */

const amb = criarAmbiente();
const { e } = amb;
const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

before(() => amb.iniciar());
after(() => amb.parar());
beforeEach(() => {
  amb.zerar();
  e.ficha = { ...e.ficha, id: ID };
});

const apagar = () => DELETE(amb.pedir("DELETE", `/api/ig/contacts/${ID}`), comId(ID));

test("apaga o índice, grava o marcador (hash, não o id) e pede à Zernio para apagar cada conversa", async () => {
  e.indiceApagado = [{ zernio_conversation_id: "z-1", ig_account_id: "conta-1" }, { zernio_conversation_id: "z-2", ig_account_id: "conta-1" }];
  const r = await apagar();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, copiaNaZernio: false });
  const marcador = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_contact_tombstones" && c.metodo === "POST")?.corpo as Record<string, unknown>;
  assert.equal(marcador.ig_user_hash, tombstoneHash(LOJA, "u1"));
  assert.doesNotMatch(JSON.stringify(marcador), /"u1"/);
  const indice = amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_conversations" && c.metodo === "DELETE");
  assert.deepEqual([indice?.url.searchParams.get("tenant_id"), indice?.url.searchParams.get("ig_user_id")], [`eq.${LOJA}`, "eq.u1"]);
  assert.deepEqual(amb.pedidosZernio.map((p) => [p.metodo, p.url.pathname, p.url.searchParams.get("accountId")]), [["DELETE", "/api/v1/inbox/conversations/z-1", "acc-z"], ["DELETE", "/api/v1/inbox/conversations/z-2", "acc-z"]]);
});

test("a Zernio falhar não é erro: a pessoa já sumiu da Girumo e a resposta diz que a cópia ficou", async () => {
  e.zernio = () => ({ status: 503, body: {} });
  const r = await apagar();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, copiaNaZernio: true });
  assert.ok(amb.escritas().some((c) => c.url.pathname === "/rest/v1/ig_contacts" && c.metodo === "DELETE"), "a ficha foi apagada");
});

test("a conversa já não existir na Zernio (404) conta como apagada", async () => {
  e.zernio = () => ({ status: 404, body: {} });
  assert.deepEqual(await (await apagar()).json(), { ok: true, copiaNaZernio: false });
});

test("sem conversa no índice nem chama a Zernio; sem conta conectada a cópia fica", async () => {
  e.indiceApagado = [];
  assert.deepEqual(await (await apagar()).json(), { ok: true, copiaNaZernio: false });
  assert.equal(amb.pedidosZernio.length, 0);
  e.indiceApagado = [{ zernio_conversation_id: "z-1", ig_account_id: "conta-1" }];
  e.conta = null;
  assert.deepEqual(await (await apagar()).json(), { ok: true, copiaNaZernio: true });
  assert.equal(amb.pedidosZernio.length, 0);
});

test("pessoa que não existe nesta loja é 404 e nada é apagado nem marcado", async () => {
  e.ficha = null;
  assert.equal((await apagar()).status, 404);
  assert.deepEqual(amb.escritas(), []);
});
