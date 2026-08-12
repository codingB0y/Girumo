import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parsePlatformAdminEmails, platformAdminEmails, isPlatformAdminEmail } from "./platform-admins";

const original = process.env.PLATFORM_ADMIN_EMAILS;
afterEach(() => {
  if (original === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = original;
});

test("sem a variável a lista é vazia — fail-closed, ninguém é admin", () => {
  // O bug do L3: o default hardcoded dava super-admin a uma identidade que
  // nenhum ambiente declarou, e um deploy sem a variável parecia configurado.
  assert.deepEqual(parsePlatformAdminEmails(undefined), []);
  assert.deepEqual(parsePlatformAdminEmails(null), []);
  assert.deepEqual(parsePlatformAdminEmails(""), []);
  assert.deepEqual(parsePlatformAdminEmails("   "), []);
  assert.deepEqual(parsePlatformAdminEmails(",, ,"), []);
});

test("o e-mail do antigo fallback não é mais especial", () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  assert.deepEqual(platformAdminEmails(), []);
  assert.equal(isPlatformAdminEmail("igor@hubflow.com.br"), false);
});

test("normaliza espaço, caixa e entradas vazias", () => {
  assert.deepEqual(parsePlatformAdminEmails("a@b.com"), ["a@b.com"]);
  assert.deepEqual(
    parsePlatformAdminEmails("  Igor@HubFlow.com.br , ADMIN@hubflow.com.br,, "),
    ["igor@hubflow.com.br", "admin@hubflow.com.br"],
  );
});

test("isPlatformAdminEmail compara sem caixa e tolera espaço", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "igor@hubflow.com.br,admin@hubflow.com.br";
  assert.equal(isPlatformAdminEmail("igor@hubflow.com.br"), true);
  assert.equal(isPlatformAdminEmail("IGOR@HubFlow.COM.BR"), true);
  assert.equal(isPlatformAdminEmail("  admin@hubflow.com.br  "), true);
  assert.equal(isPlatformAdminEmail("estranho@exemplo.com"), false);
});

test("e-mail ausente nunca casa, nem com a lista preenchida", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "igor@hubflow.com.br";
  assert.equal(isPlatformAdminEmail(undefined), false);
  assert.equal(isPlatformAdminEmail(null), false);
  assert.equal(isPlatformAdminEmail(""), false);
  assert.equal(isPlatformAdminEmail("   "), false);
});

test("substring de um admin não casa — a lista é exata", () => {
  process.env.PLATFORM_ADMIN_EMAILS = "igor@hubflow.com.br";
  assert.equal(isPlatformAdminEmail("igor@hubflow.com.br.evil.com"), false);
  assert.equal(isPlatformAdminEmail("igor@hubflow.com"), false);
  assert.equal(isPlatformAdminEmail("xigor@hubflow.com.br"), false);
});
