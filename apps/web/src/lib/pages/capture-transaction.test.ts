import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationName = "20260723090000_lp_v2_capture_atomicity.sql";
const migrationPath = path.join(process.cwd(), "supabase", "migrations", migrationName);
const leadRouteSource = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "p", "lead", "route.ts"),
  "utf8",
);
const storeSource = readFileSync(
  path.join(process.cwd(), "src", "lib", "pages", "store.ts"),
  "utf8",
);
const applyOrder = readFileSync(
  path.join(process.cwd(), "..", "..", "deploy", "supabase", "apply-order.txt"),
  "utf8",
);

function migrationSql(): string {
  assert.equal(existsSync(migrationPath), true, `migration ausente: ${migrationName}`);
  return readFileSync(migrationPath, "utf8");
}

test("o fluxo de lead delega contato, captura, legado, evento e contador a uma única RPC", () => {
  assert.match(storeSource, /export async function confirmLpCapture/);
  assert.match(storeSource, /\.rpc\("confirm_lp_capture"/);
  assert.match(leadRouteSource, /await confirmLpCapture\(/);
  assert.doesNotMatch(
    leadRouteSource,
    /await (upsertLpContact|insertLpCapture|insertLpLead|insertLpTrackingEvent|bumpLpCounter)\(/,
  );
});

test("a RPC reconcilia evento e contador mesmo quando a captura já existe", () => {
  const sql = migrationSql();

  assert.match(sql, /create or replace function confirm_lp_capture/i);
  assert.match(sql, /insert into lp_contacts/i);
  assert.match(sql, /insert into lp_captures/i);
  assert.match(sql, /insert into lp_leads/i);
  assert.match(sql, /insert into lp_tracking_events/i);
  assert.match(sql, /update landing_pages[\s\S]*leads_count[\s\S]*count\(\*\)/i);
  assert.match(sql, /on conflict[\s\S]*do nothing/i);
  assert.doesNotMatch(sql, /if\s+v_capture_created\s+then[\s\S]*insert into lp_tracking_events/i);
});

test("a idempotência de lead_created separa versões publicadas", () => {
  const sql = migrationSql();

  assert.match(
    sql,
    /create unique index uq_lp_events_idem[\s\S]*published_version[\s\S]*idem_key/i,
  );
  assert.match(sql, /v_event_idem_key[\s\S]*p_published_version/i);
  assert.match(
    sql,
    /jsonb_build_object\(\s*'published_version'\s*,\s*p_published_version/i,
  );
});

test("a migration aditiva está na ordem de aplicação e restringe a RPC ao service role", () => {
  const sql = migrationSql();

  assert.match(applyOrder, new RegExp(`apps/web/supabase/migrations/${migrationName}`));
  assert.match(sql, /revoke all on function confirm_lp_capture[\s\S]*from public/i);
  assert.match(sql, /grant execute on function confirm_lp_capture[\s\S]*to service_role/i);
});
