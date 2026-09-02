import assert from "node:assert/strict";
import {
  REMEMBER_MAX_AGE_S,
  inviteCode,
  isMobileUa,
  readCookie,
  rememberCookieHeader,
  rememberCookieName,
  whatsappDeepLink,
} from "./deep-link";

// Só convite do WhatsApp vira esquema; qualquer outra URL fica sem deep link.
assert.equal(inviteCode("https://chat.whatsapp.com/AbC123xyz"), "AbC123xyz");
assert.equal(inviteCode("https://chat.whatsapp.com/AbC123xyz?x=1"), null);
assert.equal(inviteCode("https://loja.com.br/grupo"), null);
assert.equal(whatsappDeepLink("https://chat.whatsapp.com/AbC123xyz"), "whatsapp://chat?code=AbC123xyz");
assert.equal(whatsappDeepLink("https://loja.com.br/grupo"), null);

// Celular sim, desktop não.
assert.equal(isMobileUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram"), true);
assert.equal(isMobileUa("Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/126"), true);
assert.equal(isMobileUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126"), false);

// Nome do cookie: por campanha, sem hífen (nome de cookie não aceita tudo).
assert.equal(rememberCookieName("6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8"), "gr_6f1a2b3c4d5e6f708192a3b4c5d6e7f8");

// Leitura do header Cookie: acha o certo no meio de outros, tolera ausência.
assert.equal(readCookie("a=1; gr_x=1203%40g.us; b=2", "gr_x"), "1203@g.us");
assert.equal(readCookie("a=1", "gr_x"), null);
assert.equal(readCookie(null, "gr_x"), null);

// Header de gravação: HttpOnly, Lax, 90 dias, path só do slug; Secure só em https.
const h = rememberCookieHeader("gr_x", "1203@g.us", "saldao", true);
assert.equal(h, `gr_x=1203%40g.us; Path=/r/saldao; Max-Age=${REMEMBER_MAX_AGE_S}; HttpOnly; SameSite=Lax; Secure`);
assert.equal(rememberCookieHeader("gr_x", "1203@g.us", "saldao", false).includes("Secure"), false);
assert.equal(REMEMBER_MAX_AGE_S, 90 * 24 * 60 * 60);

console.log("deep-link.test ok");
