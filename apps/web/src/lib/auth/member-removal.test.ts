import assert from "node:assert/strict";
import { test } from "node:test";
import { canRemoveMember, type RemovalActor, type RemovalTarget } from "./member-removal";

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
