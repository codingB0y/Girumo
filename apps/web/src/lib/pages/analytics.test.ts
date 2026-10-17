import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, checkRateLimitWith } from "@/lib/security/rate-limit";
import { hashIp, isRateLimited } from "./analytics";

// IPs do bloco de documentação (RFC 5737): nunca de alguém.
function pedido(ip: string): Request {
  return new Request("https://girumo.test/api/p/lead", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

test("captura pública: o teto vale por IP e por página, com o IP em hash", async () => {
  const chamadas: Array<[string, number, number]> = [];
  const limitar = async (id: string, max: number, janela: number) => {
    chamadas.push([id, max, janela]);
    return checkRateLimitWith(null, id, max, janela);
  };
  const visitante = pedido("203.0.113.7");

  for (let i = 0; i < 5; i++) assert.equal(await isRateLimited("lead", visitante, 5, "loja-a", limitar), false);
  assert.equal(await isRateLimited("lead", visitante, 5, "loja-a", limitar), true);
  // Mesmo IP em outra página, ou outro IP na mesma página: baldes próprios.
  assert.equal(await isRateLimited("lead", visitante, 5, "loja-b", limitar), false);
  assert.equal(await isRateLimited("lead", pedido("203.0.113.8"), 5, "loja-a", limitar), false);

  assert.deepEqual(chamadas[0], [`lead:${hashIp(visitante)}:loja-a`, 5, 60_000]);
  assert.ok(chamadas.every(([id]) => !id.includes("203.0.113")), "IP cru na chave do Redis");
});

test("beacon de saída, sem página: a chave é rota + IP", async () => {
  const ids: string[] = [];
  const req = pedido("198.51.100.4");
  await isRateLimited("outbound", req, 20, undefined, async (id) => (ids.push(id), false));
  assert.deepEqual(ids, [`outbound:${hashIp(req)}`]);
});

test("sem limitador injetado conta no checkRateLimit (Upstash em produção), não num Map por instância", async () => {
  const req = pedido("198.51.100.9");
  const id = `track:${hashIp(req)}:loja-c`;
  for (let i = 0; i < 30; i++) await checkRateLimit(id, 30, 60_000);
  assert.equal(await isRateLimited("track", req, 30, "loja-c"), true);
});
