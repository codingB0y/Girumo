const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const migrationPath = "infra/migrations/202607050001_engine_command_leases.sql";

function occurrences(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function functionDefinition(sql, functionName, schema = "app") {
  const match = sql.match(new RegExp(
    `create or replace function ${schema}\\.${functionName}\\s*\\([\\s\\S]*?\\n\\$\\$;`,
    "i",
  ));
  assert.ok(match, `definicao de ${schema}.${functionName} ausente`);
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
  assert.match(sql, /create index concurrently[\s\S]*where\s+status\s*=\s*'processing'/i);
  assert.match(sql, /^\s*--[^\n]*\n--[^\n]*\n\s*begin;/i);
  assert.match(sql, /commit;/i);
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
    assert.match(definition, /lease_expires_at\s*>\s*clock_timestamp\(\)/i);
  }

  assert.match(sql, /drop function if exists app\.complete_engine_command\s*\(uuid\s*,\s*boolean\s*,\s*text\)/i);
  assert.equal(occurrences(sql, /function app\.complete_engine_command\s*\(\s*target_command_id uuid\s*,\s*success boolean/gi), 0);
  assert.match(sql, /effect_started_at\s+is\s+not\s+null[\s\S]*'uncertain'/i);
  assert.match(sql, /attempt_count\s*>=\s*(?:command\.)?max_attempts[\s\S]*'permanent'/i);
  assert.match(sql, /available_at\s*=\s*case[\s\S]*then\s+clock_timestamp\(\)\s*\+/i);
  assert.match(functionDefinition(sql, "complete_engine_command"), /if\s+success\s+is\s+null\s+then[\s\S]*raise exception/i);
});

test("RPCs PostgREST publicos delegam para app com assinaturas exatas", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const signatures = [
    ["claim_engine_commands", /max_commands integer default 5\s*,\s*lease_seconds integer default 60/i],
    ["renew_engine_command_lease", /target_command_id uuid\s*,\s*target_lease_token uuid\s*,\s*lease_seconds integer default 60/i],
    ["mark_engine_command_effect_started", /target_command_id uuid\s*,\s*target_lease_token uuid/i],
    ["complete_engine_command", /target_command_id uuid\s*,\s*target_lease_token uuid\s*,\s*success boolean\s*,\s*error_message text default null\s*,\s*target_failure_kind public\.engine_command_failure_kind default 'retryable'\s*,\s*retry_delay_seconds integer default 30/i],
    ["record_engine_event", /target_tenant_id uuid\s*,\s*target_instance_id uuid\s*,\s*target_type text\s*,\s*target_payload jsonb default '\{\}'::jsonb\s*,\s*target_event_id uuid default gen_random_uuid\(\)/i],
    ["update_instance_status", /target_tenant_id uuid\s*,\s*target_instance_id uuid\s*,\s*target_status public\.instance_status\s*,\s*target_phone text default null\s*,\s*target_qr_code text default null\s*,\s*target_engine_node text default null\s*,\s*target_metadata jsonb default '\{\}'::jsonb/i],
  ];

  for (const [name, signature] of signatures) {
    const definition = functionDefinition(sql, name, "public");
    assert.match(definition, signature);
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog/i);
    assert.match(definition, new RegExp(`app\\.${name}\\s*\\(`, "i"));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}[^;]+from public, anon, authenticated`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[^;]+to service_role`, "i"));
  }
});

test("superficie publica nao preserva conclusao sem fencing", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /drop function if exists public\.complete_engine_command\s*\(uuid\s*,\s*boolean\s*,\s*text\)/i);
  assert.equal(occurrences(sql, /function public\.complete_engine_command\s*\(\s*target_command_id uuid\s*,\s*success boolean/gi), 0);
  assert.match(functionDefinition(sql, "complete_engine_command", "public"), /target_lease_token uuid/i);
});

test("fencing usa relogio de parede e revalida depois do row lock", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.doesNotMatch(sql, /lease_expires_at\s*>\s*now\(\)/i);
  assert.doesNotMatch(sql, /lease_expires_at\s*<=\s*now\(\)/i);
  for (const name of [
    "renew_engine_command_lease",
    "mark_engine_command_effect_started",
    "complete_engine_command",
  ]) {
    const definition = functionDefinition(sql, name);
    assert.match(definition, /select[\s\S]*for update/i);
    assert.match(definition, /lease_expires_at\s*>\s*clock_timestamp\(\)/i);
  }
});

test("renovacao nunca reduz a expiracao atual do lease", () => {
  const definition = functionDefinition(
    readFileSync(migrationPath, "utf8"),
    "renew_engine_command_lease",
  );

  assert.match(definition, /lease_expires_at\s*=\s*greatest\s*\(\s*locked_command\.lease_expires_at\s*,\s*clock_timestamp\(\)\s*\+/i);
});

test("migration detecta drift de enum e colunas criticas", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /pg_catalog\.pg_enum/i);
  assert.match(sql, /array_agg\s*\(\s*enum_label\.enumlabel::text\s+order by enum_label\.enumsortorder\s*\)/i);
  assert.match(sql, /array\s*\[\s*'retryable'\s*,\s*'permanent'\s*,\s*'uncertain'\s*\]/i);
  assert.match(sql, /pg_catalog\.pg_attribute/i);
  assert.match(sql, /pg_catalog\.pg_attrdef/i);
  for (const token of ["format_type", "attnotnull", "pg_get_expr", "raise exception", "schema drift"]) {
    assert.match(sql, new RegExp(token, "i"));
  }
});

test("migration trata default ausente como drift nas contagens", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const catalogValidation = sql.match(/for expected in[\s\S]*?end loop;/i)?.[0] ?? "";

  assert.match(catalogValidation, /expected\.default_expression\s+is\s+not\s+null[\s\S]*actual_default\s+is\s+null/i);
  assert.match(catalogValidation, /\('attempt_count',[\s\S]*?'0'::text\)/i);
  assert.match(catalogValidation, /\('max_attempts',[\s\S]*?'3'::text\)/i);
});

test("migration valida definicao de constraints existentes sem exigir VALIDATE", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /pg_catalog\.pg_constraint/i);
  assert.match(sql, /pg_catalog\.pg_get_constraintdef/i);
  assert.match(sql, /engine_commands_attempt_count_nonnegative/i);
  assert.match(sql, /engine_commands_max_attempts_positive/i);
  assert.match(sql, /attempt_count\s*>=\s*0/i);
  assert.match(sql, /max_attempts\s*>\s*0/i);
  assert.match(sql, /raise exception[^;]*constraint[^;]*schema drift/is);
  assert.doesNotMatch(sql, /convalidated\s*=\s*true/i);
});

test("migration reduz bloqueios e documenta validacao operacional posterior", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const guide = readFileSync("deploy/supabase/apply-order.md", "utf8");

  assert.match(sql, /check\s*\(attempt_count\s*>=\s*0\)\s+not valid/i);
  assert.match(sql, /check\s*\(max_attempts\s*>\s*0\)\s+not valid/i);
  assert.match(sql, /commit;[\s\S]*drop index concurrently if exists[\s\S]*create index concurrently/i);
  assert.doesNotMatch(sql, /create index concurrently if not exists/i);
  assert.match(guide, /validate constraint engine_commands_attempt_count_nonnegative/i);
  assert.match(guide, /validate constraint engine_commands_max_attempts_positive/i);
  assert.match(guide, /create index concurrently/i);
});

test("ordenacoes concorrentes usam id como desempate deterministico", () => {
  const definition = functionDefinition(
    readFileSync(migrationPath, "utf8"),
    "claim_engine_commands",
  );

  assert.match(definition, /order by command\.lease_expires_at asc\s*,\s*command\.id asc/i);
  assert.match(definition, /order by command\.created_at asc\s*,\s*command\.id asc/i);
});

test("implementacoes app fixam search_path e nao sao concedidas diretamente", () => {
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
    assert.doesNotMatch(sql, new RegExp(`grant execute on function app\\.${functionName}[^;]+to service_role`, "i"));
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
