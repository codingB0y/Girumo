import assert from "node:assert/strict";
import { test } from "node:test";

import { lerAcaoLotado, lotaDeNovoEm, mensagemAindaCheio, notaDoReabrir, respostaDaAcao } from "./acao-lotado";
import type { EstadoGrupo } from "./estado";

const ID = "0b6f7c1e-2f43-4a51-9d3e-6a1c2b3d4e5f";
const OUTRO_ID = "7d1e0c2a-5b4f-4c3d-8e2f-1a0b9c8d7e6f";

function grupo(groupId: string): EstadoGrupo {
  return {
    posicao: 1,
    groupId,
    whatsappGroupId: "g1@g.us",
    nome: "Moda Kids do Sul 1",
    membros: 996,
    capacidade: 1024,
    isAdmin: true,
    inviteUrl: "https://chat.whatsapp.com/C1",
    lotadoEm: "2026-10-01T12:00:00Z",
    lotadoPor: "auto",
    reabertoEm: null,
    avisoLotouEm: "2026-10-01T12:00:00Z",
    estado: "lotado",
    podeReabrir: false,
    naRegra: { menos_enchendo: true, lotados: true, com_gente: true },
  };
}

test("lê marcar e reabrir de um grupo desta campanha", () => {
  const daCampanha = [grupo(ID)];
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "marcar" }, daCampanha), {
    ok: true,
    grupo: daCampanha[0],
    acao: "marcar",
  });
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "reabrir" }, daCampanha), {
    ok: true,
    grupo: daCampanha[0],
    acao: "reabrir",
  });
});

test("corpo, ação ou id fora do formato são 400", () => {
  const daCampanha = [grupo(ID)];
  for (const corpo of [null, [], "marcar", 42]) {
    assert.deepEqual(lerAcaoLotado(corpo, daCampanha), { ok: false, status: 400, error: "Corpo inválido." });
  }
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "apagar" }, daCampanha), {
    ok: false,
    status: 400,
    error: 'acao deve ser "marcar" ou "reabrir".',
  });
  assert.deepEqual(lerAcaoLotado({ acao: "marcar" }, daCampanha), { ok: false, status: 400, error: "groupId inválido." });
  // O JID não serve: a ação é pelo UUID de `groups` (EstadoGrupo.groupId).
  assert.deepEqual(lerAcaoLotado({ groupId: "g1@g.us", acao: "marcar" }, daCampanha), {
    ok: false,
    status: 400,
    error: "groupId inválido.",
  });
});

test("grupo que não é desta campanha é 404, mesmo com id bem-formado", () => {
  // Review Focus 1. Mutante: tirar o `find` e mandar o groupId direto ao RPC, que só filtra tenant.
  assert.deepEqual(lerAcaoLotado({ groupId: OUTRO_ID, acao: "marcar" }, [grupo(ID)]), {
    ok: false,
    status: 404,
    error: "Grupo não encontrado nesta campanha.",
  });
  assert.deepEqual(lerAcaoLotado({ groupId: ID, acao: "reabrir" }, []), {
    ok: false,
    status: 404,
    error: "Grupo não encontrado nesta campanha.",
  });
});

test("a mensagem do ainda_cheio é a do mockup, com milhar e porcentagem", () => {
  const cauda = "O link só manda gente abaixo de 95%: aumente a capacidade ou espere sair gente.";
  assert.equal(mensagemAindaCheio(996, 1024), `Ainda está com 996 de 1.024 (97%). ${cauda}`);
  assert.equal(mensagemAindaCheio(1003, 1024), `Ainda está com 1.003 de 1.024 (98%). ${cauda}`);
  // Capacidade 0 vale 1024, como app.limiar_lotado.
  assert.equal(mensagemAindaCheio(990, 0), `Ainda está com 990 de 1.024 (97%). ${cauda}`);
});

test("lota de novo sozinho no primeiro número que alcança 95%", () => {
  assert.equal(lotaDeNovoEm(1024), 973);
  assert.equal(lotaDeNovoEm(100), 95);
  assert.equal(lotaDeNovoEm(0), 973);
  assert.equal(lotaDeNovoEm(1), 1);
  // 960,45: arredonda para CIMA. Mutante ceil → round daria 960, que ainda não é 95%.
  assert.equal(lotaDeNovoEm(1011), 961);
});

test("a nota do Reabrir só promete prioridade a quem o link pode mesmo mandar gente", () => {
  const comVaga = { ...grupo(ID), membros: 812, podeReabrir: true };
  const lota = "Lota de novo sozinho em 973.";
  assert.equal(notaDoReabrir(comVaga), `Volta para o link com prioridade sobre o grupo que está enchendo. ${lota}`);
  // Sem convite (ou convite sem esquema) e sem admin: reabre, mas vai para a fila que o link pula.
  assert.equal(
    notaDoReabrir({ ...comVaga, inviteUrl: null }),
    `Reabre, mas o link pula este grupo até ele ter convite. ${lota}`,
  );
  assert.equal(
    notaDoReabrir({ ...comVaga, inviteUrl: "chat.whatsapp.com/sem-esquema" }),
    `Reabre, mas o link pula este grupo até ele ter convite. ${lota}`,
  );
  assert.equal(
    notaDoReabrir({ ...comVaga, isAdmin: false }),
    `Reabre, mas o link pula este grupo enquanto o nosso número não for admin. ${lota}`,
  );
  // Ainda cheio: o motivo do travado, como antes.
  assert.equal(notaDoReabrir(grupo(ID)), mensagemAindaCheio(996, 1024));
});

test("cada resultado do banco vira o status e o motivo do contrato", () => {
  const g = { membros: 996, capacidade: 1024 };
  assert.deepEqual(respostaDaAcao("ok", g), { status: 200, corpo: { ok: true } });
  assert.deepEqual(respostaDaAcao("nao_encontrado", g), { status: 404, corpo: { error: "Grupo não encontrado." } });
  assert.deepEqual(respostaDaAcao("ja_lotado", g), {
    status: 409,
    corpo: { error: "Este grupo já está marcado como lotado.", motivo: "ja_lotado" },
  });
  assert.deepEqual(respostaDaAcao("nao_lotado", g), {
    status: 409,
    corpo: { error: "Este grupo não está marcado como lotado.", motivo: "nao_lotado" },
  });
  assert.deepEqual(respostaDaAcao("ainda_cheio", g), {
    status: 409,
    corpo: { error: mensagemAindaCheio(996, 1024), motivo: "ainda_cheio" },
  });
});
