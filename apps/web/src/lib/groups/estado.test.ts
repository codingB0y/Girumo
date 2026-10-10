import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REGRAS,
  ROTULO_ESTADO,
  ROTULO_REGRA,
  estadoFromRow,
  isRegraDestino,
  type EstadoRow,
} from "./estado";

/** Linha como `public.campaign_group_states` devolve; cada teste muda o que precisa. */
const linha = (over: Partial<EstadoRow> = {}): EstadoRow => ({
  posicao: 3,
  group_id: "7d0c2f4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
  whatsapp_group_id: "120363000000000003@g.us",
  name: "Moda Kids do Sul 3",
  members: 812,
  capacity: 1024,
  is_admin: true,
  invite_url: "https://chat.whatsapp.com/KxY7bQ2mNp",
  lotado_em: "2026-10-07T14:08:00+00:00",
  lotado_por: "manual",
  reaberto_em: null,
  aviso_lotou_em: "2026-10-07T14:08:30+00:00",
  estado: "lotado",
  pode_reabrir: true,
  na_regra_menos_enchendo: true,
  na_regra_lotados: true,
  na_regra_com_gente: true,
  ...over,
});

test("a linha da RPC vira o EstadoGrupo do contrato, campo a campo", () => {
  assert.deepEqual(estadoFromRow(linha()), {
    posicao: 3,
    groupId: "7d0c2f4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
    whatsappGroupId: "120363000000000003@g.us",
    nome: "Moda Kids do Sul 3",
    membros: 812,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/KxY7bQ2mNp",
    lotadoEm: "2026-10-07T14:08:00+00:00",
    lotadoPor: "manual",
    reabertoEm: null,
    avisoLotouEm: "2026-10-07T14:08:30+00:00",
    estado: "lotado",
    podeReabrir: true,
    naRegra: { menos_enchendo: true, lotados: true, com_gente: true },
  });
});

test("cada regra vem da sua coluna — trocar duas de lugar muda quem recebe o post", () => {
  // Mutante: ligar `lotados` em `na_regra_menos_enchendo` (ou o contrário).
  const enchendo = estadoFromRow(
    linha({
      estado: "enchendo",
      lotado_em: null,
      lotado_por: null,
      aviso_lotou_em: null,
      pode_reabrir: false,
      na_regra_menos_enchendo: false,
      na_regra_lotados: false,
      na_regra_com_gente: true,
    }),
  );
  assert.deepEqual(enchendo.naRegra, { menos_enchendo: false, lotados: false, com_gente: true });

  const fila = estadoFromRow(
    linha({ estado: "fila", na_regra_menos_enchendo: true, na_regra_lotados: false, na_regra_com_gente: true }),
  );
  assert.deepEqual(fila.naRegra, { menos_enchendo: true, lotados: false, com_gente: true });
});

test("nulos da linha continuam nulos — grupo sem convite não ganha convite vazio", () => {
  const g = estadoFromRow(
    linha({ estado: "vazio", invite_url: null, lotado_em: null, lotado_por: null, aviso_lotou_em: null, reaberto_em: null }),
  );
  assert.equal(g.inviteUrl, null);
  assert.equal(g.lotadoEm, null);
  assert.equal(g.lotadoPor, null);
  assert.equal(g.avisoLotouEm, null);
  assert.equal(g.reabertoEm, null);
});

test("rótulos da tela, um por estado e por regra; o atalho padrão vem primeiro", () => {
  assert.deepEqual(ROTULO_ESTADO, { lotado: "Lotado", enchendo: "Enchendo agora", fila: "Na fila", vazio: "Vazio" });
  assert.deepEqual(ROTULO_REGRA, {
    menos_enchendo: "Todos menos o que está enchendo",
    lotados: "Só lotados",
    com_gente: "Todos com gente",
  });
  // D6: "Todos menos o que está enchendo" é o padrão, e é o primeiro atalho.
  assert.deepEqual(REGRAS, ["menos_enchendo", "lotados", "com_gente"]);
});

test("isRegraDestino só aceita as três regras, do jeito que o banco grava", () => {
  for (const regra of REGRAS) assert.equal(isRegraDestino(regra), true, regra);
  for (const lixo of ["todos", "", "LOTADOS", "menos-enchendo", null, undefined, 1, {}]) {
    assert.equal(isRegraDestino(lixo), false, String(lixo));
  }
});
