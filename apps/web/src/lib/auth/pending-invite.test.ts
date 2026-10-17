import assert from "node:assert/strict";
import { test } from "node:test";
import {
  googleOwnershipProof,
  normalizeInviteEmail,
  requiresInviteLink,
  selectPendingInvite,
  type InviteOwnershipProof,
  type PendingInvite,
} from "./pending-invite";

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

/** O Google já verificou o e-mail: casa pelo e-mail, como sempre casou. */
const PELO_GOOGLE: InviteOwnershipProof = { emailVerifiedBy: "google" };

test("normalizeInviteEmail lowercases and trims", () => {
  assert.equal(normalizeInviteEmail("  Maria@Loja.COM "), "maria@loja.com");
});

test("normalizeInviteEmail turns nullish into empty string", () => {
  assert.equal(normalizeInviteEmail(null), "");
  assert.equal(normalizeInviteEmail(undefined), "");
});

test("selectPendingInvite matches the invite by email, case-insensitive", () => {
  const chosen = selectPendingInvite([invite({ invited_email: "Convidado@Loja.com" })], "convidado@loja.com", PELO_GOOGLE);
  assert.equal(chosen?.id, "m1");
});

test("selectPendingInvite returns null when no invite matches the email", () => {
  const chosen = selectPendingInvite([invite({ invited_email: "outro@loja.com" })], "convidado@loja.com", PELO_GOOGLE);
  assert.equal(chosen, null);
});

test("selectPendingInvite never matches on an empty email (no phantom bind)", () => {
  const chosen = selectPendingInvite([invite({ invited_email: "" })], "", PELO_GOOGLE);
  assert.equal(chosen, null);
});

test("selectPendingInvite picks the oldest invite when many tenants invited the same email", () => {
  const chosen = selectPendingInvite(
    [
      invite({ id: "novo", tenant_id: "t2", created_at: "2026-08-10T00:00:00.000Z" }),
      invite({ id: "antigo", tenant_id: "t1", created_at: "2026-08-01T00:00:00.000Z" }),
    ],
    "convidado@loja.com",
    PELO_GOOGLE,
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
    PELO_GOOGLE,
  );
  assert.equal(chosen?.id, "com-data");
});

/*
 * Prova de posse. O cadastro por senha nasce com e-mail confirmado sem ninguém
 * ter aberto a caixa, então "digitou o e-mail do convite" não prova nada: quem
 * soubesse o e-mail entrava na loja com o papel do convite (até admin).
 */

test("selectPendingInvite without proof never accepts, even when the email matches", () => {
  assert.equal(selectPendingInvite([invite({})], "convidado@loja.com", null), null);
});

test("selectPendingInvite with the invite link accepts exactly that invite", () => {
  const chosen = selectPendingInvite(
    [
      invite({ id: "antigo", tenant_id: "t1", created_at: "2026-08-01T00:00:00.000Z" }),
      invite({ id: "do-link", tenant_id: "t2", created_at: "2026-08-10T00:00:00.000Z" }),
    ],
    "Convidado@Loja.com",
    { inviteId: "do-link" },
  );
  assert.equal(chosen?.id, "do-link");
  assert.equal(chosen?.tenant_id, "t2");
});

test("selectPendingInvite rejects an invite id that belongs to another email", () => {
  const chosen = selectPendingInvite(
    [invite({ id: "meu" }), invite({ id: "de-outro", invited_email: "outro@loja.com" })],
    "convidado@loja.com",
    { inviteId: "de-outro" },
  );
  assert.equal(chosen, null);
});

test("selectPendingInvite rejects an invite id that is not pending", () => {
  assert.equal(selectPendingInvite([invite({ id: "m1" })], "convidado@loja.com", { inviteId: "m2" }), null);
});

test("googleOwnershipProof accepts a Google identity with the same email", () => {
  const proof = googleOwnershipProof(
    [{ provider: "google", identity_data: { email: "Convidado@Loja.com" } }],
    "convidado@loja.com",
  );
  assert.deepEqual(proof, { emailVerifiedBy: "google" });
});

test("googleOwnershipProof refuses an email/password identity", () => {
  assert.equal(
    googleOwnershipProof([{ provider: "email", identity_data: { email: "convidado@loja.com" } }], "convidado@loja.com"),
    null,
  );
});

test("googleOwnershipProof refuses a Google identity of another email", () => {
  assert.equal(
    googleOwnershipProof([{ provider: "google", identity_data: { email: "outro@gmail.com" } }], "convidado@loja.com"),
    null,
  );
});

test("googleOwnershipProof refuses missing identities or an empty email", () => {
  assert.equal(googleOwnershipProof(undefined, "convidado@loja.com"), null);
  assert.equal(googleOwnershipProof([{ provider: "google", identity_data: {} }], ""), null);
});

/*
 * Cadastro por senha de e-mail convidado: só passa com o link do convite. Sem
 * ele a conta nasceria confirmada e fora da equipe, e o convite ficaria
 * pendurado para sempre.
 */

test("requiresInviteLink is true for an invited email without the invite link", () => {
  assert.equal(requiresInviteLink([invite({})], "Convidado@Loja.com", ""), true);
});

test("requiresInviteLink is true when the id belongs to another email's invite", () => {
  assert.equal(
    requiresInviteLink(
      [invite({ id: "meu" }), invite({ id: "de-outro", invited_email: "outro@loja.com" })],
      "convidado@loja.com",
      "de-outro",
    ),
    true,
  );
});

test("requiresInviteLink is false with the email's own invite link", () => {
  assert.equal(requiresInviteLink([invite({ id: "meu" })], "convidado@loja.com", "meu"), false);
});

test("requiresInviteLink is false for an email nobody invited (rows from a looser ilike do not count)", () => {
  assert.equal(requiresInviteLink([invite({ invited_email: "convidadoXloja.com" })], "convidado@loja.com", ""), false);
  assert.equal(requiresInviteLink([], "convidado@loja.com", ""), false);
});
