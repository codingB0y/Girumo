const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const migrationPath = "infra/migrations/202607050001_engine_command_leases.sql";

function occurrences(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function functionDefinition(sql, functionName) {
  const match = sql.match(new RegExp(
    `create or replace function app\\.${functionName}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ));
  assert.ok(match, `definicao de app.${functionName} ausente`);
  return match[0];
}

test("migration implementa schema aditivo de lease e fencing", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create type public\.engine_command_failure_kind\s+as enum\s*\(\s*'retryable'\s*,\s*'permanent'\s*,\s*'uncertain'\s*\)/i);
  assert.match(sql, /exception\s+when\s+duplicate_object\s+then\s+null/i);

  for (const column of [
    "lease_token uuid",
    "lease_expires_at timestamptz",
    "attempt_count integer not null default 0",
    "max_attempts integer not null default 3",
    "effect_started_at timestamptz",
    "failure_kind public.engine_command_failure_kind",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists\\s+${column}`, "i"));
  }

  assert.match(sql, /check\s*\(attempt_count\s*>=\s*0\)/i);
  assert.match(sql, /check\s*\(max_attempts\s*>\s*0\)/i);
  assert.match(sql, /create index if not exists[\s\S]*where\s+status\s*=\s*'processing'/i);
  assert.match(sql, /^\s*--[^\n]*\n--[^\n]*\n\s*begin;/i);
  assert.match(sql, /commit;\s*$/i);
});

test("migration aposenta comandos processing antigos sem requeue", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /where\s+status\s*=\s*'processing'[\s\S]{0,200}lease_token\s+is\s+null/i);
  assert.match(sql, /failure_kind\s*=\s*'uncertain'/i);
  assert.match(sql, /failed_at\s*=\s*coalesce\s*\(failed_at\s*,\s*now\(\)\)/i);
  assert.doesNotMatch(sql, /where\s+status\s*=\s*'processing'[\s\S]{0,200}lease_token\s+is\s+null[\s\S]{0,200}status\s*=\s*'queued'/i);
});

test("claim substitui assinatura antiga, recupera leases e reivindica com lock", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /drop function if exists app\.claim_engine_commands\s*\(integer\)/i);
  assert.match(sql, /create (?:or replace )?function app\.claim_engine_commands\s*\(\s*max_commands integer default 5\s*,\s*lease_seconds integer default 60\s*\)/i);
  assert.equal(occurrences(sql, /function app\.claim_engine_commands\s*\(\s*max_commands integer default 5\s*\)/gi), 0);
  assert.match(sql, /greatest\s*\(15\s*,\s*least\s*\(coalesce\s*\(lease_seconds\s*,\s*60\)\s*,\s*900\)\)/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /lease_expires_at\s+asc[\s\S]{0,160}limit\s+least\s*\(/i);
  assert.match(sql, /attempt_count\s*=\s*[^,;]*attempt_count\s*\+\s*1/i);
  assert.match(sql, /lease_token\s*=\s*gen_random_uuid\s*\(\)/i);

  for (const eventType of [
    "engine_command_requeued",
    "engine_command_uncertain",
    "engine_command_attempts_exhausted",
  ]) {
    assert.match(sql, new RegExp(`'${eventType}'`, "i"));
  }
  assert.match(sql, /jsonb_build_object\s*\(\s*'command_id'\s*,[^,]+,\s*'attempt_count'\s*,[^)]+\)/i);
  assert.doesNotMatch(sql, /jsonb_build_object\s*\([^)]*'payload'/i);
});

test("RPCs de renovacao, efeito e conclusao exigem lease atual e valido", () => {
  const sql = readFileSync(migrationPath, "utf8");

  for (const functionName of [
    "renew_engine_command_lease",
    "mark_engine_command_effect_started",
    "complete_engine_command",
  ]) {
    const definition = functionDefinition(sql, functionName);
    assert.match(definition, /target_lease_token uuid/i);
    assert.match(definition, /where[\s\S]*?status\s*=\s*'processing'/i);
    assert.match(definition, /lease_token\s*=\s*target_lease_token/i);
    assert.match(definition, /lease_expires_at\s*>\s*now\(\)/i);
  }

  assert.match(sql, /drop function if exists app\.complete_engine_command\s*\(uuid\s*,\s*boolean\s*,\s*text\)/i);
  assert.equal(occurrences(sql, /function app\.complete_engine_command\s*\(\s*target_command_id uuid\s*,\s*success boolean/gi), 0);
  assert.match(sql, /effect_started_at\s+is\s+not\s+null[\s\S]*'uncertain'/i);
  assert.match(sql, /attempt_count\s*>=\s*(?:command\.)?max_attempts[\s\S]*'permanent'/i);
  assert.match(sql, /available_at\s*=\s*case[\s\S]*then\s+now\(\)\s*\+/i);
  assert.match(functionDefinition(sql, "complete_engine_command"), /if\s+success\s+is\s+null\s+then[\s\S]*raise exception/i);
});

test("funcoes privilegiadas fixam search_path e restringem execucao", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const functionNames = [
    "claim_engine_commands",
    "renew_engine_command_lease",
    "mark_engine_command_effect_started",
    "complete_engine_command",
  ];

  for (const functionName of functionNames) {
    const definition = functionDefinition(sql, functionName);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = public, app/i);
    assert.match(sql, new RegExp(`revoke execute on function app\\.${functionName}[^;]+from public`, "i"));
    assert.match(sql, new RegExp(`grant execute on function app\\.${functionName}[^;]+to service_role`, "i"));
  }
});

test("ordem de deploy inclui migration uma vez apos RPC base", () => {
  const order = readFileSync("deploy/supabase/apply-order.txt", "utf8");
  const guide = readFileSync("deploy/supabase/apply-order.md", "utf8");
  const migrationEntry = "infra/migrations/202607050001_engine_command_leases.sql";

  assert.equal(order.split(migrationEntry).length - 1, 1);
  assert.ok(order.indexOf(migrationEntry) > order.indexOf("infra/migrations/202606240005_engine_rpc.sql"));
  assert.ok(order.indexOf(migrationEntry) < order.indexOf("infra/migrations/202606240006_membership_invites.sql"));
  assert.match(guide, /202607050001_engine_command_leases\.sql/);
  assert.match(guide, /interromper[\s\S]*workers antigos/i);
});
