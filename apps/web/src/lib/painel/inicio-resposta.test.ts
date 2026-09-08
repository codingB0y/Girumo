import { strict as assert } from "node:assert";
import { test } from "node:test";

import { resolverPartes } from "./inicio-resposta";

test("casa cada resultado com a sua chave, nao com a posicao", async () => {
  // Arrange — dois arrays de tipos diferentes: trocar a ordem passaria batido
  // num destructuring posicional, que e exatamente o que esta funcao remove.
  const tarefas = {
    grupos: async () => [{ id: "g1" }],
    leads: async () => [{ id: "l1" }],
    contagem: async () => 7,
  };

  // Act
  const partes = await resolverPartes(tarefas);

  // Assert
  assert.deepEqual(partes.grupos, { ok: true, data: [{ id: "g1" }] });
  assert.deepEqual(partes.leads, { ok: true, data: [{ id: "l1" }] });
  assert.deepEqual(partes.contagem, { ok: true, data: 7 });
});

test("uma tarefa que falha nao derruba as outras", async () => {
  // Arrange
  const tarefas = {
    boa: async () => "valor",
    ruim: async () => {
      throw new Error("banco fora");
    },
    outraBoa: async () => 42,
  };

  // Act
  const partes = await resolverPartes(tarefas);

  // Assert — so a que falhou vira ok:false; o resto chega inteiro.
  assert.deepEqual(partes.boa, { ok: true, data: "valor" });
  assert.deepEqual(partes.ruim, { ok: false });
  assert.deepEqual(partes.outraBoa, { ok: true, data: 42 });
});

test("roda as tarefas em paralelo, nao uma depois da outra", async () => {
  // Arrange — o ganho inteiro do PR e este. Sequencial some com ele sem
  // quebrar nenhuma asercao de valor, entao a asercao precisa ser de tempo.
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const tarefas = {
    a: async () => {
      await espera(60);
      return "a";
    },
    b: async () => {
      await espera(60);
      return "b";
    },
    c: async () => {
      await espera(60);
      return "c";
    },
  };

  // Act
  const t0 = Date.now();
  await resolverPartes(tarefas);
  const decorrido = Date.now() - t0;

  // Assert — em serie daria 180 ms; em paralelo, perto de 60 ms.
  assert.ok(decorrido < 150, `esperava paralelo (<150 ms), levou ${decorrido} ms`);
});

test("valor ausente ainda e sucesso: nulo nao e falha", async () => {
  // Arrange — /api/settings devolve campos nulos para quem nunca definiu meta.
  // Confundir isso com erro reacende o bug de "ausencia de dado vira zero".
  const tarefas = {
    settings: async () => null,
    lista: async () => [],
  };

  // Act
  const partes = await resolverPartes(tarefas);

  // Assert
  assert.deepEqual(partes.settings, { ok: true, data: null });
  assert.deepEqual(partes.lista, { ok: true, data: [] });
});

test("sem tarefa nenhuma devolve objeto vazio, nao estoura", async () => {
  assert.deepEqual(await resolverPartes({}), {});
});
