import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldEnqueueGrow, hasHeadroom, type PoolGroup } from "./grow-headroom";

const g = (members: number, inviteUrl?: string, capacity = 1000): PoolGroup => ({
  members,
  capacity,
  inviteUrl,
});

const CONVITE = "https://chat.whatsapp.com/KxY7bQ2mNp";

test("campanha sem nenhum grupo enfileira o primeiro", () => {
  assert.equal(shouldEnqueueGrow([]), true);
  assert.equal(shouldEnqueueGrow([], 0), true);
});

test("ids declarados que não resolvem NÃO enfileiram — é dado quebrado, não pool novo", () => {
  // group_ids com uuid da linha em vez do JID: nenhum id casa, o pool sai vazio.
  // Sem o segundo argumento isso seria lido como "campanha nova" e criaria grupo.
  assert.equal(shouldEnqueueGrow([], 2), false);
});

test("pool inteiro sem convite NÃO enfileira — é convite faltando, não lotação", () => {
  // O caso de produção: 194 grupos, zero invite_url. A regra antiga criava grupo aqui.
  assert.equal(shouldEnqueueGrow([g(1000), g(1000), g(10)]), false);
});

test("um grupo roteável com folga segura a fila", () => {
  assert.equal(shouldEnqueueGrow([g(1000, CONVITE), g(500, CONVITE)]), false);
});

test("todos os roteáveis acima de 90% enfileira", () => {
  assert.equal(shouldEnqueueGrow([g(900, CONVITE), g(950, CONVITE)]), true);
});

test("grupo com folga mas SEM convite não conta como folga", () => {
  // O de 10 membros tem espaço de sobra, mas ninguém chega nele pelo /r/.
  assert.equal(shouldEnqueueGrow([g(1000, CONVITE), g(10)]), true);
});

test("exatamente 90% já conta como cheio", () => {
  assert.equal(shouldEnqueueGrow([g(900, CONVITE)]), true);
  assert.equal(shouldEnqueueGrow([g(899, CONVITE)]), false);
});

test("capacidade zerada não vira divisão maluca nem folga infinita", () => {
  assert.equal(hasHeadroom(g(0, CONVITE, 0)), false);
  assert.equal(shouldEnqueueGrow([g(0, CONVITE, 0)]), true);
});

test("grupo lotado abaixo de 90% NÃO é folga — marcado à mão com 812 seguraria o próximo para sempre", () => {
  const lotado: PoolGroup = { members: 812, capacity: 1024, inviteUrl: CONVITE, lotadoEm: "2026-10-09T12:00:00Z" };
  assert.equal(hasHeadroom(lotado), false);
  // Mutante: tirar o lotado do pool (ou dos roteáveis) deixaria a lista vazia — e
  // vazio aqui é "convite faltando"/"dado quebrado" (false), não "tudo cheio".
  assert.equal(shouldEnqueueGrow([lotado]), true);
});

test("ao lado de um lotado, um grupo aberto com folga ainda segura a fila", () => {
  const lotado: PoolGroup = { members: 812, capacity: 1024, inviteUrl: CONVITE, lotadoEm: "2026-10-09T12:00:00Z" };
  assert.equal(shouldEnqueueGrow([lotado, g(100, CONVITE)]), false);
});

test("sem a marca, o mesmo grupo de 812 de 1024 continua sendo folga", () => {
  assert.equal(hasHeadroom({ members: 812, capacity: 1024, inviteUrl: CONVITE, lotadoEm: null }), true);
});
