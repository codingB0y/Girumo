import assert from "node:assert/strict";
import { test } from "node:test";

import { conviteDoGrupo, type DepsDoConvite } from "./convite";
import type { LojaDoRastreio } from "./loja";

const LOJA: LojaDoRastreio = { tenantId: "t-1", nome: "Loja Exemplo", publicSlug: "loja-exemplo", dominio: null, corPrimaria: null, storeWhatsapp: "5511999990000", vipLinkId: "l-1" };

function montar(extra: Partial<DepsDoConvite> = {}) {
  const consultas: string[][] = [];
  const deps: DepsDoConvite = {
    linkPorId: async () => ({ slug: "vip-exemplo" }),
    jaEhLead: async (_t, telefones) => { consultas.push(telefones); return false; },
    ...extra,
  };
  return { deps, consultas };
}
const URL_WWW = { url: "https://www.girumo.com.br/r/vip-exemplo" };

test("link público do VIP: /r/<slug> no www e /<slug> no domínio do lojista", async () => {
  assert.deepEqual(await conviteDoGrupo(LOJA, "5511987654321", montar().deps), URL_WWW);
  assert.deepEqual(await conviteDoGrupo({ ...LOJA, dominio: "loja.exemplo.test" }, "5511987654321", montar().deps), { url: "https://loja.exemplo.test/vip-exemplo" });
});

test("quem já é lead da loja não recebe convite; a consulta usa as 4 formas do telefone", async () => {
  const { deps, consultas } = montar();
  deps.jaEhLead = async (_t, telefones) => { consultas.push(telefones); return true; };
  assert.equal(await conviteDoGrupo(LOJA, "5511987654321", deps), null);
  assert.deepEqual([...consultas[0]].sort(), ["1187654321", "11987654321", "551187654321", "5511987654321"]);
});

test("sem vipLinkId, link apagado ou consulta que falha: sem convite; sem telefone: convida sem consultar", async () => {
  const { deps, consultas } = montar();
  assert.equal(await conviteDoGrupo({ ...LOJA, vipLinkId: null }, "5511987654321", deps), null);
  assert.equal(await conviteDoGrupo(LOJA, "5511987654321", montar({ linkPorId: async () => null }).deps), null);
  assert.deepEqual(await conviteDoGrupo(LOJA, null, deps), URL_WWW);
  assert.deepEqual(consultas, []);
  const aviso = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await conviteDoGrupo(LOJA, "5511987654321", montar({ jaEhLead: async () => { throw new Error("banco fora do ar"); } }).deps), null);
  } finally { console.warn = aviso; }
});
