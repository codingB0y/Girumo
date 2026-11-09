import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { ENV, TENANT, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { marcarCredencialInvalida } from "./credencial-invalida";

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => ({}), chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);

beforeEach(() => {
  Object.assign(process.env, ENV);
  estado.chamadas.length = 0;
});

const posts = () => estado.chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications");

test("aviso não lido igual já existe: não insere de novo", async () => {
  banco = { "PATCH /rest/v1/yampi_connections": [200, [{ tenant_id: TENANT }]], "GET /rest/v1/notifications": [200, [{ id: "n1" }]] };
  await marcarCredencialInvalida(TENANT);
  assert.equal(posts().length, 0);
  const [busca] = estado.chamadas.filter((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/notifications");
  assert.deepEqual([busca.url.searchParams.get("tenant_id"), busca.url.searchParams.get("read_at")], [`eq.${TENANT}`, "is.null"]);
});

test("a conexão que já não estava ativa não avisa", async () => {
  banco = { "PATCH /rest/v1/yampi_connections": [200, []] };
  await marcarCredencialInvalida(TENANT);
  assert.deepEqual(estado.chamadas.map((c) => c.url.pathname), ["/rest/v1/yampi_connections"]);
});

test("falha do banco no sino não lança e vai para o log com o id da loja", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  banco = { "PATCH /rest/v1/yampi_connections": [200, [{ tenant_id: TENANT }]], "GET /rest/v1/notifications": [500, { message: "banco fora" }] };
  await marcarCredencialInvalida(TENANT);
  assert.match(log.mock.calls.map((c) => c.arguments.join(" ")).join("\n"), new RegExp(TENANT));
});
