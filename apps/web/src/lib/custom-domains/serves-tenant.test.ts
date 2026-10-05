import assert from "node:assert/strict";
import { test } from "node:test";
import { hostServesTenant } from "./serves-tenant";

test("host do Girumo serve qualquer tenant sem consultar o banco", async () => {
  let consultas = 0;
  const lookup = async () => {
    consultas++;
    return null;
  };
  assert.equal(await hostServesTenant("app.girumo.com.br", "loja-a", lookup), true);
  assert.equal(await hostServesTenant("localhost", "loja-b", lookup), true);
  assert.equal(consultas, 0);
});

test("domínio de lojista serve só o próprio tenant", async () => {
  const lookup = async (h: string) => (h === "links.loja-a.com.br" ? "loja-a" : null);
  assert.equal(await hostServesTenant("Links.Loja-A.com.br", "loja-a", lookup), true);
  assert.equal(await hostServesTenant("links.loja-a.com.br", "loja-b", lookup), false);
  assert.equal(await hostServesTenant("desconhecido.loja.com.br", "loja-a", lookup), false);
});

test("erro na consulta nega", async (t) => {
  t.mock.method(console, "error", () => {});
  const lookup = async (): Promise<string | null> => {
    throw new Error("banco fora");
  };
  assert.equal(await hostServesTenant("links.loja-a.com.br", "loja-a", lookup), false);
});
