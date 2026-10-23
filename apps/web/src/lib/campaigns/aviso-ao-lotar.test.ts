import test from "node:test";
import assert from "node:assert/strict";

import type { EstadoGrupo } from "@/lib/groups/estado";

import { AVISO_AO_LOTAR_MAX, lerAvisoAoLotar, proximoAviso, ultimosAvisos } from "./aviso-ao-lotar";

const LIGOU = "2026-10-11T12:00:00.000Z";
const EDITOU = "2026-10-12T09:30:00.000Z";
const RELIGOU = "2026-10-14T18:00:00.000Z";
const DESLIGADO = { aviso_ao_lotar: null, aviso_ao_lotar_desde: null };

test("ligar: vazio → texto grava o texto aparado e desde = agora", () => {
  assert.deepEqual(proximoAviso({ texto: null, desde: null }, "  Grupo lotado!  ", LIGOU), {
    aviso_ao_lotar: "Grupo lotado!",
    aviso_ao_lotar_desde: LIGOU,
  });
});

test("desligar: texto → vazio zera o texto e o desde", () => {
  assert.deepEqual(proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "", EDITOU), DESLIGADO);
  assert.deepEqual(proximoAviso({ texto: null, desde: null }, "", EDITOU), DESLIGADO);
});

test("mensagem só com espaços ou quebras de linha é desligar, não um aviso em branco", () => {
  assert.deepEqual(proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "  \n\t ", EDITOU), DESLIGADO);
  assert.deepEqual(proximoAviso({ texto: null, desde: null }, "   ", EDITOU), DESLIGADO);
});

test("trocar o texto com o aviso ligado mantém o desde: quem lotou antes da edição ainda recebe", () => {
  assert.deepEqual(
    proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "Lotou! Amanhã às 9h tem novidade.", EDITOU),
    { aviso_ao_lotar: "Lotou! Amanhã às 9h tem novidade.", aviso_ao_lotar_desde: LIGOU },
  );
  // Salvar a tela sem mexer no aviso reenvia o mesmo texto: nada muda.
  assert.deepEqual(proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "Grupo lotado!", EDITOU), {
    aviso_ao_lotar: "Grupo lotado!",
    aviso_ao_lotar_desde: LIGOU,
  });
});

test("desligar e religar começa do zero: quem lotou com o aviso desligado não é rearmado", () => {
  const desligado = proximoAviso({ texto: "Grupo lotado!", desde: LIGOU }, "", EDITOU);
  const religado = proximoAviso(
    { texto: desligado.aviso_ao_lotar, desde: desligado.aviso_ao_lotar_desde },
    "Grupo lotado!",
    RELIGOU,
  );
  assert.equal(religado.aviso_ao_lotar_desde, RELIGOU);
});

test("texto gravado sem desde (dado torto) ganha desde = agora; senão o aviso ligado nunca sairia", () => {
  const corrigido = proximoAviso({ texto: "Grupo lotado!", desde: null }, "Grupo lotado!", EDITOU);
  assert.equal(corrigido.aviso_ao_lotar_desde, EDITOU);
});

test("lerAvisoAoLotar: texto aparado até 1000 caracteres; acima disso ou outro tipo é erro", () => {
  assert.deepEqual(lerAvisoAoLotar("  Grupo lotado!\n"), { ok: true, texto: "Grupo lotado!" });
  assert.deepEqual(lerAvisoAoLotar(""), { ok: true, texto: "" });
  const cheio = "a".repeat(AVISO_AO_LOTAR_MAX);
  assert.deepEqual(lerAvisoAoLotar(`  ${cheio}  `), { ok: true, texto: cheio });
  assert.equal(lerAvisoAoLotar(`${cheio}a`).ok, false);
  assert.equal(lerAvisoAoLotar(null).ok, false);
  assert.equal(lerAvisoAoLotar(42).ok, false);
});

const DESDE = LIGOU;
// Migração do PR 1 (§5.7): grava aviso_lotou_em = lotado_em = now() nos já cheios, sem enviar nada.
const BACKFILL = "2026-10-10T23:00:00.000Z";

function grupo(nome: string, campos: Partial<EstadoGrupo> = {}): EstadoGrupo {
  return {
    posicao: 1,
    groupId: `id-${nome}`,
    whatsappGroupId: `${nome}@g.us`,
    nome,
    membros: 1000,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/abc",
    lotadoEm: null,
    lotadoPor: null,
    reabertoEm: null,
    avisoLotouEm: null,
    estado: "lotado",
    podeReabrir: false,
    naRegra: { menos_enchendo: true, lotados: true, com_gente: true },
    ...campos,
  };
}

/** Lotou às 14:59:30 do dia e a varredura avisou às 15:00, noutra transação. */
function avisado(dia: number, campos: Partial<EstadoGrupo> = {}): EstadoGrupo {
  return grupo(`Moda Kids do Sul ${dia}`, {
    lotadoEm: `2026-10-${dia}T14:59:30.000Z`,
    lotadoPor: "auto",
    avisoLotouEm: `2026-10-${dia}T15:00:00.000Z`,
    ...campos,
  });
}

test("últimos avisos: os que receberam, mais recentes primeiro, no máximo 5, sem mexer na lista recebida", () => {
  const grupos = [13, 18, 15, 17, 12, 16, 14].map((dia) => avisado(dia));
  const ordemOriginal = grupos.map((g) => g.nome);
  assert.deepEqual(
    ultimosAvisos(grupos, DESDE).map((g) => g.nome),
    ["Moda Kids do Sul 18", "Moda Kids do Sul 17", "Moda Kids do Sul 16", "Moda Kids do Sul 15", "Moda Kids do Sul 14"],
  );
  assert.equal(ultimosAvisos(grupos, DESDE, 2).length, 2);
  assert.deepEqual(grupos.map((g) => g.nome), ordemOriginal);
});

test("grupo descoberto já cheio (marcado sem aviso: avisoLotouEm igual a lotadoEm) fica fora", () => {
  const descobertoCheio = grupo("Descoberto cheio", {
    lotadoEm: "2026-10-13T10:00:00.000Z",
    lotadoPor: "auto",
    avisoLotouEm: "2026-10-13T10:00:00.000Z",
  });
  assert.equal(ultimosAvisos([descobertoCheio], DESDE).length, 0);
});

test("backfill de antes de ligar o aviso fica fora, mesmo depois de reaberto ou lotado de novo", () => {
  const reaberto = grupo("Backfill reaberto", {
    lotadoEm: null,
    reabertoEm: "2026-10-12T09:00:00.000Z",
    avisoLotouEm: BACKFILL,
    estado: "enchendo",
  });
  const relotado = grupo("Backfill relotado", {
    lotadoEm: "2026-10-14T09:00:00.000Z",
    lotadoPor: "auto",
    avisoLotouEm: BACKFILL,
  });
  assert.equal(ultimosAvisos([reaberto, relotado], DESDE).length, 0);
});

test("aviso enviado continua na lista depois de o grupo ser reaberto", () => {
  const reaberto = avisado(13, { lotadoEm: null, lotadoPor: null, reabertoEm: "2026-10-15T09:00:00.000Z", estado: "fila" });
  assert.deepEqual(ultimosAvisos([reaberto], DESDE).map((g) => g.nome), ["Moda Kids do Sul 13"]);
});

test("aviso desligado (sem desde) ou grupo que nunca recebeu: nada", () => {
  assert.equal(ultimosAvisos([avisado(13)], null).length, 0);
  assert.equal(ultimosAvisos([grupo("Nunca lotou", { estado: "fila" })], DESDE).length, 0);
});

test("grupo sem admin fica fora: o banco o carimba como avisado, mas nada foi enviado", () => {
  const semAdmin = avisado(13, { isAdmin: false });
  const admin = avisado(14);
  assert.deepEqual(ultimosAvisos([semAdmin, admin], DESDE).map((g) => g.nome), ["Moda Kids do Sul 14"]);
});

test("carimbo do banco (microssegundos e +00:00) é lido", () => {
  const doBanco = grupo("Do banco", {
    lotadoEm: "2026-10-13T14:59:30.123456+00:00",
    avisoLotouEm: "2026-10-13T15:00:00.654321+00:00",
  });
  assert.equal(ultimosAvisos([doBanco], DESDE).length, 1);
});
