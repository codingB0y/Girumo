import assert from "node:assert/strict";
import { test } from "node:test";

import { ENTRADA_DEFAULTS } from "@/lib/campaigns/settings";
import type { EstadoGrupo } from "@/lib/groups/estado";
import { destinoDoLink } from "./destino-do-link";
import { paradoDoLink } from "./link-parado";

/** 12h de 10/10 em Brasília. */
const AGORA = new Date("2026-10-10T15:00:00Z");

function grupo(p: Pick<EstadoGrupo, "posicao" | "estado"> & Partial<EstadoGrupo>): EstadoGrupo {
  return {
    groupId: `00000000-0000-4000-8000-${String(p.posicao).padStart(12, "0")}`,
    whatsappGroupId: `g${p.posicao}@g.us`,
    nome: `Moda Kids do Sul ${p.posicao}`,
    membros: 100,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: `https://chat.whatsapp.com/C${p.posicao}`,
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    podeReabrir: false,
    naRegra: { menos_enchendo: false, lotados: false, com_gente: false },
    ...p,
  };
}
const ids = (gs: EstadoGrupo[]) => gs.map((g) => g.whatsappGroupId);

test("manda para o enchendo do banco, não para o primeiro com vaga da sequência antiga", () => {
  // Marcado à mão com 812 (abaixo de 95%): withSequentialEstado mandaria para ele.
  const marcado = [
    grupo({ posicao: 1, estado: "lotado", membros: 812, lotadoPor: "manual", lotadoEm: "2026-10-09T12:00:00Z" }),
    grupo({ posicao: 2, estado: "enchendo", membros: 300 }),
  ];
  const d1 = destinoDoLink({ estados: marcado, groupIds: ids(marcado), gruposNaTela: 2, entrada: ENTRADA_DEFAULTS, agora: AGORA });
  assert.equal(d1.grupo?.posicao, 2);
  assert.equal(d1.parado, null);

  // Reaberto com prioridade: o banco diz que o 3 enche, mesmo com o 1 tendo vaga.
  const reaberto = [
    grupo({ posicao: 1, estado: "fila", membros: 40 }),
    grupo({ posicao: 3, estado: "enchendo", membros: 900, reabertoEm: "2026-10-10T10:00:00Z" }),
  ];
  const d2 = destinoDoLink({ estados: reaberto, groupIds: ids(reaberto), gruposNaTela: 2, entrada: ENTRADA_DEFAULTS, agora: AGORA });
  assert.equal(d2.grupo?.posicao, 3);
});

test("sem grupo enchendo, o link está parado com o motivo e o destino do /r/", () => {
  const cheios = [
    grupo({ posicao: 1, estado: "lotado", membros: 1000 }),
    grupo({ posicao: 2, estado: "lotado", membros: 990 }),
  ];
  assert.deepEqual(
    destinoDoLink({ estados: cheios, groupIds: ids(cheios), gruposNaTela: 2, entrada: ENTRADA_DEFAULTS, agora: AGORA }),
    { grupo: null, parado: paradoDoLink("all-full", ids(cheios), 2, ENTRADA_DEFAULTS.lotado) },
  );
});

test("campanha encerrada vence o grupo que está enchendo", () => {
  const um = [grupo({ posicao: 1, estado: "enchendo" })];
  const encerrada = { ...ENTRADA_DEFAULTS, encerra_em: "2026-10-01" };
  assert.deepEqual(
    destinoDoLink({ estados: um, groupIds: ids(um), gruposNaTela: 1, entrada: encerrada, agora: AGORA }),
    { grupo: null, parado: paradoDoLink("closed", ids(um), 1, encerrada.lotado) },
  );
});

test("grupos da campanha fora dos estados: quem diz se sumiram da conta é o que a página leu de /api/groups", () => {
  // Mutante: passar estados.length (0) no lugar de gruposNaTela troca "não estão mais na sua
  // conta" (grave) por "não apareceram aqui".
  assert.deepEqual(
    destinoDoLink({ estados: [], groupIds: ["sumiu@g.us"], gruposNaTela: 5, entrada: ENTRADA_DEFAULTS, agora: AGORA }),
    { grupo: null, parado: paradoDoLink("empty-pool", ["sumiu@g.us"], 5, ENTRADA_DEFAULTS.lotado) },
  );
});
