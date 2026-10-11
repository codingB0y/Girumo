import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { cidConferido, cidDaUrl } from "./cid";

const CID = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const url = (busca: string) => new URL(`https://app.girumo.com.br/r/vip-atacado${busca}`);

test("lê o cid uuid da URL, em minúsculas; o primeiro vale", () => {
  assert.equal(cidDaUrl(url(`?cid=${CID}`)), CID);
  assert.equal(cidDaUrl(url(`?cid=${CID.toUpperCase()}`)), CID);
  assert.equal(cidDaUrl(url(`?cid=${CID}&cid=outro`)), CID);
  assert.equal(cidDaUrl(url(`?utm_source=ig&cid=${CID}`)), CID);
});

test("sem cid ou cid que não é uuid: null", () => {
  assert.equal(cidDaUrl(url("")), null);
  assert.equal(cidDaUrl(url("?cid=")), null);
  assert.equal(cidDaUrl(url("?cid=123")), null);
  assert.equal(cidDaUrl(url(`?cid=${CID}x`)), null);
  assert.equal(cidDaUrl(url("?cid='%20or%201=1")), null);
});

test("só vale se o cadastro for da loja do link; conferência recebe o tenant do link", async () => {
  const vistos: string[] = [];
  const confere = async (tenantId: string, id: string) => {
    vistos.push(`${tenantId}:${id}`);
    return tenantId === "loja-a";
  };
  assert.equal(await cidConferido(url(`?cid=${CID}`), "loja-a", confere), CID);
  assert.equal(await cidConferido(url(`?cid=${CID}`), "loja-b", confere), null);
  assert.deepEqual(vistos, [`loja-a:${CID}`, `loja-b:${CID}`]);
});

test("sem cid não consulta; erro na consulta vira null (o clique segue)", async () => {
  let chamou = false;
  assert.equal(await cidConferido(url(""), "loja-a", async () => { chamou = true; return true; }), null);
  assert.equal(chamou, false);

  const aviso = mock.method(console, "warn", () => {});
  try {
    assert.equal(await cidConferido(url(`?cid=${CID}`), "loja-a", async () => { throw new Error("banco caiu"); }), null);
    assert.equal(aviso.mock.callCount(), 1);
    const mensagem = String(aviso.mock.calls[0].arguments[0]);
    assert.match(mensagem, /banco caiu/);
    assert.ok(!mensagem.includes(CID));
  } finally {
    aviso.mock.restore();
  }
});
