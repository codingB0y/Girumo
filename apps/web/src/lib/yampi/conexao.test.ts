import assert from "node:assert/strict";
import { test } from "node:test";

import { ENV, TENANT, linhaDaConexao, servirYampi, type EstadoYampiFalso, type RespostaFalsa } from "@/test/yampi-falso";

import { conexaoYampiAtiva } from "./conexao";

let banco: Record<string, RespostaFalsa | RespostaFalsa[]> = {};
const estado: EstadoYampiFalso = { papel: () => "owner", banco: () => banco, yampi: () => ({}), chamadas: [], chamadasYampi: [], linhaDoTempo: [] };
servirYampi(estado);
Object.assign(process.env, ENV);

test("conexaoYampiAtiva devolve ativa e aviso_desativado; credencial_invalida, desconectada e sem linha devolvem null", async () => {
  for (const status of ["ativa", "aviso_desativado"]) {
    banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao({ status })]] };
    assert.equal((await conexaoYampiAtiva(TENANT))?.status, status);
  }
  for (const status of ["credencial_invalida", "desconectada"]) {
    banco = { "GET /rest/v1/yampi_connections": [200, [linhaDaConexao({ status })]] };
    assert.equal(await conexaoYampiAtiva(TENANT), null, status);
  }
  banco = { "GET /rest/v1/yampi_connections": [200, []] };
  assert.equal(await conexaoYampiAtiva(TENANT), null);
  assert.ok(estado.chamadas.every((c) => c.url.searchParams.get("tenant_id") === `eq.${TENANT}`));
});
