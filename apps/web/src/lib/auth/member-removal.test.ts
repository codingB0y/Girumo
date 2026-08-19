import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canOfferRemoval,
  canRemoveMember,
  removalActionLabel,
  removalPrompt,
  removalSuccess,
  type RemovalActor,
  type RemovalTarget,
} from "./member-removal";

const owner: RemovalActor = { role: "owner", authUserId: "u-owner" };
const admin: RemovalActor = { role: "admin", authUserId: "u-admin" };

function target(over: Partial<RemovalTarget> = {}): RemovalTarget {
  return { role: "operator", userId: "u-alvo", ...over };
}

test("owner remove um operator", () => {
  const d = canRemoveMember({ actor: owner, target: target(), ownerCount: 1 });
  assert.equal(d.allowed, true);
});

test("admin remove um operator", () => {
  const d = canRemoveMember({ actor: admin, target: target(), ownerCount: 1 });
  assert.equal(d.allowed, true);
});

test("ninguem remove a si mesmo", () => {
  const d = canRemoveMember({
    actor: admin,
    target: target({ role: "admin", userId: "u-admin" }),
    ownerCount: 1,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "self");
  assert.equal(d.allowed === false && d.status, 400);
});

test("admin NAO remove um owner — senao toma o tenant", () => {
  const d = canRemoveMember({
    actor: admin,
    target: target({ role: "owner" }),
    ownerCount: 2,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "admin-cannot-remove-owner");
  assert.equal(d.allowed === false && d.status, 403);
});

test("owner remove outro owner quando ha mais de um", () => {
  const d = canRemoveMember({ actor: owner, target: target({ role: "owner" }), ownerCount: 2 });
  assert.equal(d.allowed, true);
});

test("o ultimo owner nao pode ser removido — tenant ficaria orfao", () => {
  const d = canRemoveMember({
    actor: owner,
    target: target({ role: "owner", userId: "u-outro" }),
    ownerCount: 1,
  });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "last-owner");
  assert.equal(d.allowed === false && d.status, 409);
});

test("convite de owner ainda pendente pode ser revogado mesmo com um unico owner ativo", () => {
  // userId nulo = convite nao aceito; revogar nao deixa o tenant sem dono.
  const d = canRemoveMember({
    actor: owner,
    target: target({ role: "owner", userId: null }),
    ownerCount: 1,
  });
  assert.equal(d.allowed, true);
});

test("convite pendente nunca casa a trava de auto-remocao (userId nulo)", () => {
  const d = canRemoveMember({
    actor: admin,
    target: target({ role: "operator", userId: null }),
    ownerCount: 1,
  });
  assert.equal(d.allowed, true);
});

/* -------------------------------------------------------------------------- */
/* Interface                                                                  */
/* -------------------------------------------------------------------------- */

// O PR #109 entregou rota e componente, mas o componente ficou orfao: a tela
// real (painel/configuracoes) nunca importou o botao, entao revogar convite
// simplesmente nao existia para o lojista. Estes testes cobrem a versao ligada.
test("owner nao oferece botao de remover", () => {
  assert.equal(canOfferRemoval({ role: "owner", accepted_at: "2026-07-01" }), false);
});

test("admin e operator oferecem botao", () => {
  assert.equal(canOfferRemoval({ role: "admin" }), true);
  assert.equal(canOfferRemoval({ role: "operator" }), true);
});

test("convite pendente fala em revogar, nao em remover", () => {
  const row = { role: "operator", invited_email: "a@b.com", accepted_at: null };
  assert.match(removalPrompt(row), /Revogar o convite/);
  assert.doesNotMatch(removalPrompt(row), /perde o acesso/);
  assert.equal(removalSuccess(row), "Convite revogado.");
  assert.match(removalActionLabel(row), /^Revogar convite de a@b\.com$/);
});

test("membro ativo fala em remover, e avisa da perda de acesso", () => {
  const row = { role: "operator", invited_email: "a@b.com", accepted_at: "2026-08-19" };
  assert.match(removalPrompt(row), /Remover a@b\.com da equipe/);
  assert.match(removalPrompt(row), /perde o acesso/);
  assert.equal(removalSuccess(row), "Membro removido.");
});

test("linha sem e-mail nao vira texto quebrado", () => {
  assert.match(removalPrompt({ role: "operator", accepted_at: "x" }), /Remover este membro da equipe/);
  assert.match(removalPrompt({ role: "operator", invited_email: "   " }), /Revogar o convite de este membro/);
});
