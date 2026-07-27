import assert from "node:assert/strict";
import {
  CANONICAL_EVENTS,
  captureIdemKey,
  deviceFromUserAgent,
  isCanonicalEvent,
  legacyAliasFor,
} from "./capture";

// ---- device: dimensão da captura (§5), derivada do user-agent ----
assert.equal(
  deviceFromUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  ),
  "mobile",
);
assert.equal(
  deviceFromUserAgent("Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 Mobile Safari"),
  "mobile",
);
// iPad se anuncia como Macintosh em alguns modos, mas "iPad" no UA clássico
assert.equal(
  deviceFromUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
  "tablet",
);
assert.equal(
  deviceFromUserAgent("Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 Safari"),
  "tablet",
);
assert.equal(
  deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120"),
  "desktop",
);
assert.equal(deviceFromUserAgent(null), null);
assert.equal(deviceFromUserAgent(""), null);

// ---- idempotência da captura ----
// A unique é (landing_page_id, published_version, contact_id, idem_key): o contato
// já está na chave, então o idem_key só precisa fechar a JANELA — mesmo dia, mesma
// pessoa, mesma versão = uma captura, por mais que ela reenvie ou recarregue.
const manha = new Date("2026-07-17T09:00:00Z");
const noite = new Date("2026-07-17T23:59:00Z");
const amanha = new Date("2026-07-18T00:01:00Z");
assert.equal(captureIdemKey(manha), captureIdemKey(noite)); // mesmo dia → mesma chave
assert.notEqual(captureIdemKey(manha), captureIdemKey(amanha)); // outro dia → recaptura
assert.match(captureIdemKey(manha), /2026-07-17/);

// ---- funil canônico ----
assert.deepEqual(CANONICAL_EVENTS, [
  "page_view",
  "form_start",
  "lead_submit_attempt",
  "lead_created",
  "group_click",
]);
assert.equal(isCanonicalEvent("page_view"), true);
assert.equal(isCanonicalEvent("Lead"), false); // legado não entra como canônico
assert.equal(isCanonicalEvent("qualquer_coisa"), false);

// back-map: métrica de página antiga não zera quando o nome do evento muda
assert.equal(legacyAliasFor("page_view"), "PageView");
assert.equal(legacyAliasFor("lead_created"), "Lead");
assert.equal(legacyAliasFor("group_click"), "GroupJoin");
assert.equal(legacyAliasFor("form_start"), null); // não existia no legado
assert.equal(legacyAliasFor("lead_submit_attempt"), null);

console.log("capture tests passed");
