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
