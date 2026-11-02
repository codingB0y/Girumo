import assert from "node:assert/strict";
import { test } from "node:test";
import { canaisDoAviso } from "@/lib/rastreio/avisar";
import { MATRIZ_PADRAO, type Etapa, type PedidoGravado } from "@/lib/rastreio/tipos";

const gravado = (etapa: Etapa, mudou = true): PedidoGravado => ({ id: "ped-1", etapa, etapaAnterior: "separando", mudou, linkToken: "0".repeat(32), paradoEm: null, temTelefone: true, temEmail: true });
const base = { gravado: gravado("enviado"), origem: "aviso" as const, atualizadoNaYampi: "2026-10-29T14:00:00Z", agora: new Date("2026-10-29T15:00:00Z"), matriz: MATRIZ_PADRAO, paradoEm: null, temTelefone: true, temEmail: true };
const canais = (extra: Partial<Parameters<typeof canaisDoAviso>[0]>) => canaisDoAviso({ ...base, ...extra });
test("matriz padrão: enviado nos dois canais, entregue só no WhatsApp, confirmado e separando em nenhum", () => {
  assert.deepEqual([canais({}), canais({ gravado: gravado("entregue") }), canais({ gravado: gravado("confirmado") }), canais({ gravado: gravado("separando") })],
    [["whatsapp", "email"], ["whatsapp"], [], []]);
});
test("pedido velho reaparecendo não avisa; a varredura avisa como o aviso da Yampi", () => {
  assert.deepEqual(canais({ atualizadoNaYampi: "2026-10-26T14:59:59Z" }), []);
  assert.deepEqual(canais({ atualizadoNaYampi: "2026-10-26T15:00:00Z" }), ["whatsapp", "email"]);
  for (const extra of [{ origem: "importacao" as const }, { gravado: gravado("enviado", false) }, { atualizadoNaYampi: "ontem" }]) assert.deepEqual(canais(extra), []);
  assert.deepEqual(canais({ origem: "varredura" }), ["whatsapp", "email"]);
});
test("parar avisos, falta de contato e a matriz da loja cortam canal", () => {
  assert.deepEqual(canais({ paradoEm: "2026-10-29T14:30:00Z" }), []);
  assert.deepEqual([canais({ temTelefone: false }), canais({ temEmail: false })], [["email"], ["whatsapp"]]);
  assert.deepEqual(canais({ matriz: { ...MATRIZ_PADRAO, enviado: { whatsapp: false, email: true } } }), ["email"]);
});
