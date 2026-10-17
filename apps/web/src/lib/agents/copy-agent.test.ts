import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimitWith } from "@/lib/security/rate-limit";
import { generateCopy, isCopyRateLimited } from "./copy-agent";

test("campo gigante não vira prompt gigante na Anthropic", async (t) => {
  const antes = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "chave-falsa-de-teste";
  t.after(() => {
    if (antes === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = antes;
  });
  const enviado = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ content: [{ text: "[Curta] a\n---\n[Média] b" }], model: "m" }),
  );

  await generateCopy({
    type: "oferta",
    tone: "direto",
    product: "p".repeat(100_000),
    price: "1".repeat(100_000),
    discount: "2".repeat(100_000),
    extraContext: "c".repeat(100_000),
  });

  const init = enviado.mock.calls[0]?.arguments[1] as RequestInit;
  const prompt: string = JSON.parse(String(init.body)).messages[0].content;
  for (const [campo, max] of [["p", 200], ["1", 200], ["2", 200], ["c", 500]] as const) {
    assert.ok(prompt.includes(campo.repeat(max)), `${campo} sumiu do prompt`);
    assert.ok(!prompt.includes(campo.repeat(max + 1)), `${campo} passou de ${max}`);
  }
});

test("frequência: 20 gerações por hora por loja, cada loja no seu balde", async () => {
  const janelas: number[] = [];
  const limitar = async (id: string, max: number, janela: number) => {
    janelas.push(janela);
    return checkRateLimitWith(null, id, max, janela);
  };

  for (let i = 0; i < 20; i++) assert.equal(await isCopyRateLimited("loja-copy-a", limitar), false);
  assert.equal(await isCopyRateLimited("loja-copy-a", limitar), true);
  assert.equal(await isCopyRateLimited("loja-copy-b", limitar), false);
  assert.ok(janelas.every((j) => j === 3_600_000));
});
