import assert from "node:assert/strict";
import { test } from "node:test";

import { ETAPAS, ETAPAS_COM_AVISO, MATRIZ_PADRAO } from "./tipos";

test("as 8 etapas na ordem do spec §1.1 e as 5 que têm aviso", () => {
  assert.deepEqual([...ETAPAS], ["aguardando_pagamento", "confirmado", "separando", "enviado", "retirada", "problema", "entregue", "cancelado"]);
  assert.deepEqual([...ETAPAS_COM_AVISO], ["confirmado", "enviado", "retirada", "problema", "entregue"]);
});

test("MATRIZ_PADRAO é a coluna do §1.1 e o default de tracking_settings.matrix", () => {
  assert.deepEqual(MATRIZ_PADRAO, {
    confirmado: { whatsapp: false, email: false },
    enviado: { whatsapp: true, email: true },
    retirada: { whatsapp: true, email: true },
    problema: { whatsapp: true, email: true },
    entregue: { whatsapp: true, email: false },
  });
});
