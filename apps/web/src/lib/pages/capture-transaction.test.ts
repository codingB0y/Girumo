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

  assert.match(sql, /create or replace function (?:public\.)?confirm_lp_capture/i);
  assert.match(sql, /insert into (?:public\.)?lp_contacts/i);
  assert.match(sql, /insert into (?:public\.)?lp_captures/i);
  assert.match(sql, /insert into (?:public\.)?lp_leads/i);
  assert.match(sql, /insert into (?:public\.)?lp_tracking_events/i);
  assert.match(sql, /update (?:public\.)?landing_pages[\s\S]*leads_count[\s\S]*count\(\*\)/i);
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
  assert.equal(
    applyOrder.split(`apps/web/supabase/migrations/${migrationName}`).length - 1,
    1,
  );
  assert.match(sql, /revoke all on function (?:public\.)?confirm_lp_capture[\s\S]*from public/i);
  assert.match(sql, /grant execute on function (?:public\.)?confirm_lp_capture[\s\S]*to service_role/i);
});

test("a RPC evita colisao entre OUT params PL/pgSQL e colunas das tabelas", () => {
  const sql = migrationSql();

  assert.match(
    sql,
    /returns table\s*\(\s*out_created boolean,\s*out_contact_id uuid,\s*out_capture_id uuid\s*\)/i,
  );
  assert.match(
    sql,
    /from public\.lp_captures as capture[\s\S]*capture\.landing_page_id\s*=\s*p_landing_page_id[\s\S]*capture\.published_version\s*=\s*p_published_version[\s\S]*capture\.contact_id\s*=\s*v_contact_id[\s\S]*capture\.idem_key\s*=\s*p_idem_key/i,
  );
  assert.match(storeSource, /out_contact_id\?: string/);
  assert.match(storeSource, /contactId:\s*row\.out_contact_id/);
  assert.doesNotMatch(
    sql,
    /returns table\s*\(\s*created boolean,\s*contact_id uuid,\s*capture_id uuid\s*\)/i,
  );
});

test("a RPC bloqueia a landing page antes de inserir e reconciliar a captura", () => {
  const sql = migrationSql();

  assert.match(
    sql,
    /begin[\s\S]*perform 1\s+from public\.landing_pages as target_page[\s\S]*for update;[\s\S]*if not found then[\s\S]*insert into public\.lp_contacts/i,
  );
});

test("a migration publica indice, RPC e permissoes em uma unica transacao", () => {
  const sql = migrationSql();
  const transactionBegin = sql.search(/^begin;$/im);
  const dropIndex = sql.search(/drop index if exists (?:public\.)?uq_lp_events_idem/i);
  const createFunction = sql.search(
    /create or replace function (?:public\.)?confirm_lp_capture/i,
  );
  const revokePublic = sql.search(
    /revoke all on function (?:public\.)?confirm_lp_capture[\s\S]*?from public/i,
  );
  const grantServiceRole = sql.search(
    /grant execute on function (?:public\.)?confirm_lp_capture[\s\S]*?to service_role/i,
  );
  const transactionCommit = sql.search(/^commit;$/im);

  assert.ok(transactionBegin >= 0 && transactionBegin < dropIndex);
  assert.ok(dropIndex < createFunction);
  assert.ok(createFunction < revokePublic);
  assert.ok(revokePublic < grantServiceRole);
  assert.ok(grantServiceRole < transactionCommit);
  assert.equal(sql.slice(transactionCommit + "commit;".length).trim(), "");
});

test("a RPC SECURITY DEFINER usa search_path seguro e objetos qualificados", () => {
  const sql = migrationSql();

  assert.match(sql, /create or replace function public\.confirm_lp_capture/i);
  assert.match(sql, /security definer\s+set search_path = pg_catalog, pg_temp/i);
  for (const table of [
    "landing_pages",
    "lp_contacts",
    "lp_captures",
    "lp_leads",
    "lp_tracking_events",
  ]) {
    assert.match(sql, new RegExp(`public\\.${table}`, "i"));
  }
  assert.match(
    sql,
    /alter function public\.confirm_lp_capture[\s\S]*owner to postgres/i,
  );
});
