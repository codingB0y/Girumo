import test from "node:test";
import assert from "node:assert/strict";

import { isTabbable, resolveTabTarget, type FocusCandidate } from "./focus-trap";

const candidate = (over: Partial<FocusCandidate> & { ariaHidden?: string | null } = {}): FocusCandidate => ({
  tabIndex: over.tabIndex ?? 0,
  disabled: over.disabled,
  hidden: over.hidden,
  getAttribute: (name: string) => (name === "aria-hidden" ? (over.ariaHidden ?? null) : null),
});

test("isTabbable aceita um botão comum", () => {
  assert.equal(isTabbable(candidate()), true);
});

test("isTabbable rejeita elemento desabilitado", () => {
  assert.equal(isTabbable(candidate({ disabled: true })), false);
});

test("isTabbable rejeita tabIndex negativo", () => {
  assert.equal(isTabbable(candidate({ tabIndex: -1 })), false);
});

test("isTabbable rejeita elemento escondido de leitores de tela", () => {
  assert.equal(isTabbable(candidate({ ariaHidden: "true" })), false);
});

test("isTabbable rejeita elemento com atributo hidden", () => {
  assert.equal(isTabbable(candidate({ hidden: true })), false);
});

test("isTabbable aceita tabIndex positivo", () => {
  assert.equal(isTabbable(candidate({ tabIndex: 3 })), true);
});

test("no meio da lista o browser move o foco sozinho", () => {
  assert.deepEqual(resolveTabTarget(3, 1, false), { type: "browser" });
});

test("no meio da lista o Shift+Tab também fica com o browser", () => {
  assert.deepEqual(resolveTabTarget(3, 1, true), { type: "browser" });
});

test("Tab no último elemento volta para o primeiro", () => {
  assert.deepEqual(resolveTabTarget(3, 2, false), { type: "move", index: 0 });
});

test("Shift+Tab no primeiro elemento vai para o último", () => {
  assert.deepEqual(resolveTabTarget(3, 0, true), { type: "move", index: 2 });
});

test("Tab no primeiro elemento segue o fluxo normal", () => {
  assert.deepEqual(resolveTabTarget(3, 0, false), { type: "browser" });
});

test("Shift+Tab no último elemento segue o fluxo normal", () => {
  assert.deepEqual(resolveTabTarget(3, 2, true), { type: "browser" });
});

test("com um único elemento focável o Tab permanece nele", () => {
  assert.deepEqual(resolveTabTarget(1, 0, false), { type: "move", index: 0 });
});

test("com um único elemento focável o Shift+Tab permanece nele", () => {
  assert.deepEqual(resolveTabTarget(1, 0, true), { type: "move", index: 0 });
});

test("foco fora do modal é puxado de volta pelo primeiro elemento", () => {
  assert.deepEqual(resolveTabTarget(3, -1, false), { type: "move", index: 0 });
});

test("foco fora do modal com Shift+Tab é puxado pelo último elemento", () => {
  assert.deepEqual(resolveTabTarget(3, -1, true), { type: "move", index: 2 });
});

test("modal sem nada focável bloqueia o Tab em vez de deixar escapar", () => {
  assert.deepEqual(resolveTabTarget(0, -1, false), { type: "block" });
});
