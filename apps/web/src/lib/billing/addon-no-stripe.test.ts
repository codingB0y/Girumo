import { strict as assert } from "node:assert";
import { test } from "node:test";
import { situacaoDoAddon } from "./instagram-contexto";

type Sub = Parameters<typeof situacaoDoAddon>[0] extends Iterable<infer S> ? S : never;

function sub(status: string, over: { addon?: string; tenant_id?: string; latest_invoice?: unknown } = {}): Sub {
  const { latest_invoice = null, ...metadata } = over;
  return {
    status,
    metadata: { addon: "recuperar", tenant_id: "loja-a", ...metadata },
    latest_invoice,
  } as unknown as Sub;
}

const situacao = (subs: Sub[]) => situacaoDoAddon(subs, "loja-a", "recuperar");
const NADA = { viva: false, faturaPendente: null, semPagamento: false };

test("active, trialing e past_due sozinhas: viva, sem pagamento pendente", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    assert.deepEqual(situacao([sub(status)]), { viva: true, faturaPendente: null, semPagamento: false }, status);
  }
});

test("unpaid sozinha: viva (os outros chamadores não mudam) e semPagamento", () => {
  assert.deepEqual(situacao([sub("unpaid")]), { viva: true, faturaPendente: null, semPagamento: true });
});

test("unpaid + active vence a ativa, nas duas ordens", () => {
  const esperado = { viva: true, faturaPendente: null, semPagamento: false };
  assert.deepEqual(situacao([sub("unpaid"), sub("active")]), esperado);
  assert.deepEqual(situacao([sub("active"), sub("unpaid")]), esperado);
});

test("incomplete devolve a fatura aberta; com unpaid junto, vence o semPagamento", () => {
  const incompleta = sub("incomplete", { latest_invoice: { hosted_invoice_url: "https://pay/x" } });
  assert.deepEqual(situacao([incompleta]), { viva: false, faturaPendente: "https://pay/x", semPagamento: false });
  assert.deepEqual(situacao([incompleta, sub("unpaid")]), { viva: true, faturaPendente: null, semPagamento: true });
});

test("incomplete com fatura sem URL não esconde a fatura de outro incomplete; ativa vence", () => {
  const semUrl = sub("incomplete", { latest_invoice: { hosted_invoice_url: null } });
  const comUrl = sub("incomplete", { latest_invoice: { hosted_invoice_url: "https://pay/y" } });
  assert.deepEqual(situacao([semUrl, comUrl]), { viva: false, faturaPendente: "https://pay/y", semPagamento: false });
  assert.deepEqual(situacao([comUrl, sub("active")]), { viva: true, faturaPendente: null, semPagamento: false });
});

test("ignora outra loja, outro add-on, canceladas e lista vazia", () => {
  assert.deepEqual(situacao([sub("unpaid", { tenant_id: "loja-b" })]), NADA);
  assert.deepEqual(situacao([sub("unpaid", { addon: "instagram" })]), NADA);
  assert.deepEqual(situacao([sub("canceled")]), NADA);
  assert.deepEqual(situacao([]), NADA);
});
