import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { comId, criarAmbiente, LOJA } from "@/test/ig-conversas-fake";
import { DELETE } from "./[id]/route";
import { GET, POST } from "./route";

const amb = criarAmbiente();
const { e } = amb;
const ID = "9b2f6c1e-3d4a-4b5c-8d7e-0a1b2c3d4e5f";

before(() => amb.iniciar());
after(() => amb.parar());
beforeEach(() => amb.zerar());

test("lista as respostas da loja (operador pode ler), filtrando a loja", async () => {
  e.papel = "operator";
  const r = await GET(amb.pedir("GET", "/api/ig/canned-replies"));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).respostas, [{ id: "p1", titulo: "Prazo", texto: "Enviamos em 2 dias." }]);
  assert.equal(amb.chamadas.find((c) => c.url.pathname === "/rest/v1/ig_canned_replies")?.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});

test("criar e apagar: só dono ou admin; operador e vendedora levam 403 sem gravar", async () => {
  for (const papel of ["operator", "seller"]) {
    e.papel = papel;
    assert.equal((await POST(amb.pedir("POST", "/api/ig/canned-replies", { titulo: "Oi", texto: "Olá" }))).status, 403, papel);
    assert.equal((await DELETE(amb.pedir("DELETE", `/api/ig/canned-replies/${ID}`), comId(ID))).status, 403, papel);
  }
  e.papel = "seller";
  assert.equal((await GET(amb.pedir("GET", "/api/ig/canned-replies"))).status, 403, "vendedora nem lê");
  assert.deepEqual(amb.escritas(), []);
});

test("criar: título e texto aparados e gravados na loja da sessão; 201 com o formato da tela", async () => {
  e.papel = "admin";
  const r = await POST(amb.pedir("POST", "/api/ig/canned-replies", { titulo: "  Frete ", texto: " Frete grátis acima de R$ 200. " }));
  assert.equal(r.status, 201);
  assert.deepEqual((await r.json()).resposta, { id: "novo", titulo: "Frete", texto: "Frete grátis acima de R$ 200." });
  const corpo = amb.escritas()[0].corpo as Record<string, unknown>;
  assert.deepEqual([corpo.tenant_id, corpo.title, corpo.text], [LOJA, "Frete", "Frete grátis acima de R$ 200."]);
});

test("criar: título maior que 40, texto maior que 1000 ou vazio é 400", async () => {
  for (const corpo of [{ titulo: "x".repeat(41), texto: "ok" }, { titulo: "ok", texto: "x".repeat(1001) }, { titulo: " ", texto: "ok" }, { titulo: "ok", texto: "" }, { titulo: "ok" }]) {
    assert.equal((await POST(amb.pedir("POST", "/api/ig/canned-replies", corpo))).status, 400);
  }
  assert.deepEqual(amb.escritas(), []);
});

test("criar na 51ª: o banco recusa (P0001) e a rota responde 409 com mensagem clara", async () => {
  e.cannedCheio = true;
  const r = await POST(amb.pedir("POST", "/api/ig/canned-replies", { titulo: "Mais uma", texto: "Texto" }));
  assert.equal(r.status, 409);
  const corpo = await r.json();
  assert.equal(corpo.code, "limite");
  assert.match(corpo.error, /50 respostas prontas/);
});

test("apagar: filtra a loja; id de outra loja ou inexistente é 404; id que não é uuid é 404 sem ir ao banco", async () => {
  assert.equal((await DELETE(amb.pedir("DELETE", `/api/ig/canned-replies/${ID}`), comId(ID))).status, 200);
  const apagou = amb.chamadas.find((c) => c.metodo === "DELETE");
  assert.deepEqual([apagou?.url.searchParams.get("tenant_id"), apagou?.url.searchParams.get("id")], [`eq.${LOJA}`, `eq.${ID}`]);
  e.cannedExiste = false;
  assert.equal((await DELETE(amb.pedir("DELETE", `/api/ig/canned-replies/${ID}`), comId(ID))).status, 404);
  amb.chamadas.length = 0;
  assert.equal((await DELETE(amb.pedir("DELETE", "/api/ig/canned-replies/x"), comId("x"))).status, 404);
  assert.equal(amb.chamadas.filter((c) => c.metodo === "DELETE").length, 0);
});
