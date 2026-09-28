import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { Carga } from "@/lib/painel/types";
import { buscar } from "./carregar";

type Contagem = { total: number };
const ehContagem = (corpo: unknown): corpo is Contagem =>
  typeof (corpo as Contagem | null)?.total === "number";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

async function buscarCom(resposta: () => Promise<Response>) {
  globalThis.fetch = resposta;
  const guardados: Contagem[] = [];
  const cargas: Carga[] = [];
  await buscar("/api/leads/contagem", ehContagem, (valor) => guardados.push(valor), (carga) => cargas.push(carga));
  return { guardados, cargas };
}

test("contagem na forma esperada é guardada e marca ok", async () => {
  const { guardados, cargas } = await buscarCom(async () => Response.json({ total: 1503 }));
  assert.deepEqual(guardados, [{ total: 1503 }]);
  assert.deepEqual(cargas, ["carregando", "ok"]);
});

test("resposta que não é a contagem vira erro, nunca número", async () => {
  // Mutantes: pular o `r.ok`, pular a checagem de forma, ou marcar ok depois
  // de uma exceção. Qualquer um deles põe um número inventado na tela.
  const respostas: Array<() => Promise<Response>> = [
    async () => Response.json({ error: "Não deu para contar." }, { status: 500 }),
    // Erro com corpo na forma certa (proxy, cache): só o `r.ok` segura este.
    async () => Response.json({ total: 7 }, { status: 500 }),
    async () => Response.json({ error: "200 com corpo de erro" }),
    async () => Response.json({ total: "1503" }),
    async () => {
      throw new TypeError("rede caiu");
    },
  ];
  for (const resposta of respostas) {
    const { guardados, cargas } = await buscarCom(resposta);
    assert.deepEqual(guardados, []);
    assert.deepEqual(cargas, ["carregando", "erro"]);
  }
});
