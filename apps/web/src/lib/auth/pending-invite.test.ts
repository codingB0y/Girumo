import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeInviteEmail, selectPendingInvite, type PendingInvite } from "./pending-invite";

function invite(over: Partial<PendingInvite>): PendingInvite {
  return {
    id: "m1",
    tenant_id: "t1",
    role: "operator",
    invited_email: "convidado@loja.com",
    created_at: "2026-08-01T00:00:00.000Z",
    ...over,
  };
}

test("normalizeInviteEmail lowercases and trims", () => {
  assert.equal(normalizeInviteEmail("  Maria@Loja.COM "), "maria@loja.com");
});

test("normalizeInviteEmail turns nullish into empty string", () => {
  assert.equal(normalizeInviteEmail(null), "");
  assert.equal(normalizeInviteEmail(undefined), "");
});

test("selectPendingInvite matches the invite by email, case-insensitive", () => {
  const chosen = selectPendingInvite([invite({ invited_email: "Convidado@Loja.com" })], "convidado@loja.com");
  assert.equal(chosen?.id, "m1");
});

test("selectPendingInvite returns null when no invite matches the email", () => {
  const chosen = selectPendingInvite([invite({ invited_email: "outro@loja.com" })], "convidado@loja.com");
  assert.equal(chosen, null);
});

test("selectPendingInvite never matches on an empty email (no phantom bind)", () => {
  const chosen = selectPendingInvite([invite({ invited_email: "" })], "");
  assert.equal(chosen, null);
});

test("selectPendingInvite picks the oldest invite when many tenants invited the same email", () => {
  const chosen = selectPendingInvite(
    [
      invite({ id: "novo", tenant_id: "t2", created_at: "2026-08-10T00:00:00.000Z" }),
      invite({ id: "antigo", tenant_id: "t1", created_at: "2026-08-01T00:00:00.000Z" }),
    ],
    "convidado@loja.com",
  );
  assert.equal(chosen?.id, "antigo");
  assert.equal(chosen?.tenant_id, "t1");
});

test("selectPendingInvite sorts invites with a null created_at to the end", () => {
  const chosen = selectPendingInvite(
    [
      invite({ id: "sem-data", created_at: null }),
      invite({ id: "com-data", created_at: "2026-08-05T00:00:00.000Z" }),
    ],
    "convidado@loja.com",
  );
  assert.equal(chosen?.id, "com-data");
});
