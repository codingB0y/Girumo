import assert from "node:assert/strict";
import { test } from "node:test";

import { respostaDaHomologacao } from "./homologacao-resposta";

const base = { tenantId: "loja-a", trava: true, processados: 0, falhas: 0, varredura: 0, historico: 0 };
const relatorio = { ok: true, passos: [{ passo: "GET" as const, status: 200, ms: 120, renovou: false }], totalMs: 900, erro: null };

test("rodou: 200 com o relatório, passou ou não (o resultado do teste está nele)", () => {
  assert.deepEqual(respostaDaHomologacao({ ...base, homologacao: relatorio }), { status: 200, corpo: { relatorio } });
  const falhou = { ...relatorio, ok: false, erro: "POST: HTTP 400" };
  assert.deepEqual(respostaDaHomologacao({ ...base, homologacao: falhou }), { status: 200, corpo: { relatorio: falhou } });
});

test("não rodou: a loja ocupada (sem trava) é 409; loja que precisa reconectar, desligada ou sem as variáveis, 422", () => {
  assert.deepEqual(respostaDaHomologacao({ ...base, trava: false }), {
    status: 409,
    corpo: { error: "A loja está sincronizando agora (ou pausada por erros seguidos do Bling). Tente de novo em alguns segundos." },
  });
  for (const parou of ["reconectar", "inativa", "chave", "indisponivel"] as const) {
    const r = respostaDaHomologacao({ ...base, trava: parou !== "indisponivel", parou });
    assert.equal(r.status, 422, parou);
    assert.match(String((r.corpo as { error: string }).error), /teste não rodou/, parou);
  }
});
