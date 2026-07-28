import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const templates = read("src/lib/email/templates.ts");
const client = read("src/lib/email/client.ts");
const brand = read("src/lib/brand.ts");
const automations = read("src/lib/stores/automations.ts");
const signup = read("src/app/api/auth/signup/route.ts");
const cron = read("src/app/api/cron/emails/route.ts");

test("sources transactional email identity from the Girumo brand contract", () => {
  assert.match(
    templates,
    /import\s+\{\s*BRAND,\s*BRAND_COLORS,\s*getBrandAssetUrl\s*\}\s+from\s+["']@\/lib\/brand["']/,
  );
  assert.match(templates, /getBrandAssetUrl\(BRAND\.emailLogoAsset\)/);
  assert.match(templates, /BRAND\.emailFooter/);
  assert.match(templates, /BRAND\.name/);
});

test("renders the dedicated raster email lockup responsively from 320 by 80", () => {
  assert.match(brand, /emailLogoAsset:\s*["']\/brand\/girumo\/email\/girumo-email-lockup-640x160\.png["']/);
  assert.match(templates, /getBrandAssetUrl\(BRAND\.emailLogoAsset\)/);
  assert.match(templates, /alt=["']\$\{BRAND\.name\}[^"']*["']/);
  assert.match(templates, /width=["']320["']/);
  assert.match(templates, /height=["']80["']/);
  assert.match(templates, /width:320px/);
  assert.match(templates, /max-width:100%/);
  assert.match(templates, /height:auto/);
  assert.doesNotMatch(templates, /style=["'][^"']*height:80px/);
  assert.doesNotMatch(templates, /\.svg\b/i);
});

test("uses the approved flat Girumo email palette", () => {
  for (const token of ["canvas", "paper", "volt", "acid"] as const) {
    assert.match(templates, new RegExp(`BRAND_COLORS\\.${token}`));
  }
  assert.doesNotMatch(templates, /gradient|#6a4bf0|#7c3aed|#6d28d9|purple|violet/i);
});

test("uses the transitional Girumo sender on the compatibility domain", () => {
  assert.match(
    client,
    /process\.env\.RESEND_FROM_EMAIL\s*\|\|\s*["']Girumo <noreply@hubflow\.com\.br>["']/,
  );
  assert.doesNotMatch(client, /["']HubFlow\s+</);
});

test("removes stale public email language and pricing", () => {
  const publicCopy = `${templates}\n${automations}`;
  assert.doesNotMatch(publicCopy, /HubFlow|WhatsApp Growth OS|disparos?|R\$\s*47/i);
  assert.match(templates, /Ver planos e assinar/);
});

test("retires SaaS-lifecycle triggers from lojista templates and keeps the copy brand-neutral", () => {
  // P0.7 (feat 44cada03) moved the SaaS-lifecycle triggers (no_connect_24h /
  // trial_ending) out of the lojista's automation templates into lib/email +
  // cron (see the disconnection e-mail feature). The templates that remain are
  // the lojista talking to their own customers inside the WhatsApp groups, so
  // they carry no SaaS brand name at all — neither Girumo nor HubFlow.
  assert.equal((automations.match(/Girumo/g) ?? []).length, 0);
  assert.doesNotMatch(automations, /HubFlow/);
  assert.match(automations, /RETIRED_LOJISTA_TRIGGERS/);
  assert.doesNotMatch(automations, /trigger:\s*["'](?:no_connect_24h|trial_ending)["']/);
  assert.match(automations, /delay_minutes:\s*0/);
});

test("preserves the technical app host in signup and email cron", () => {
  for (const [name, source] of [["signup", signup], ["cron", cron]] as const) {
    assert.match(
      source,
      /process\.env\.NEXT_PUBLIC_APP_URL\s*\|\|\s*["']https:\/\/app\.hubflow\.com\.br["']/,
      name,
    );
  }
});
