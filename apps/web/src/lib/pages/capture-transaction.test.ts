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
const trackRouteSource = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "p", "track", "route.ts"),
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

test("a migration remove a assinatura anterior antes de recriar OUT params e pode ser reaplicada", () => {
  const sql = migrationSql();
  const signature =
    String.raw`uuid,\s*uuid,\s*text,\s*text,\s*int,\s*text,\s*text,\s*text,\s*int,\s*text,\s*text,\s*text,\s*jsonb,\s*text,\s*text,\s*text`;
  const dropFunction = sql.search(
    new RegExp(
      String.raw`drop function if exists public\.confirm_lp_capture\(\s*${signature}\s*\)`,
      "i",
    ),
  );
  const createFunction = sql.search(
    /create or replace function public\.confirm_lp_capture/i,
  );

  assert.ok(dropFunction >= 0, "a assinatura anterior deve ser removida");
  assert.ok(dropFunction < createFunction, "DROP precisa ocorrer antes do CREATE");
});

test("a captura valida status e versão publicada sob o mesmo lock antes de escrever", () => {
  const sql = migrationSql();
  const lock = sql.match(
    /perform 1\s+from public\.landing_pages as target_page[\s\S]*?for update;/i,
  )?.[0];

  assert.ok(lock, "lock da landing page ausente");
  assert.match(lock, /target_page\.status\s*=\s*'published'/i);
  assert.match(
    lock,
    /target_page\.published_version\s*=\s*p_published_version/i,
  );
  assert.match(
    sql,
    /for update;[\s\S]*LP_RENDER_CONTEXT_STALE[\s\S]*insert into public\.lp_contacts/i,
  );
  assert.match(storeSource, /class LpRenderContextStaleError extends Error/);
  assert.match(
    leadRouteSource,
    /isLpRenderContextStaleError\([\s\S]*status:\s*409/i,
  );
});

test("tracking grava e incrementa page_view em RPC protegida pelo lock de versão", () => {
  const sql = migrationSql();
  const trackingFunction = sql.match(
    /create or replace function public\.record_lp_tracking_event[\s\S]*?\$\$;/i,
  )?.[0];

  assert.ok(trackingFunction, "RPC atômica de tracking ausente");
  const lockIndex = trackingFunction.search(
    /from public\.landing_pages as target_page[\s\S]*for update;/i,
  );
  const insertIndex = trackingFunction.search(
    /insert into public\.lp_tracking_events/i,
  );
  assert.ok(lockIndex >= 0 && lockIndex < insertIndex);
  assert.match(trackingFunction, /target_page\.status\s*=\s*'published'/i);
  assert.match(
    trackingFunction,
    /target_page\.published_version\s*=\s*p_published_version/i,
  );
  assert.match(trackingFunction, /LP_RENDER_CONTEXT_STALE/i);
  assert.match(
    trackingFunction,
    /if[\s\S]*p_event_name\s*=\s*'page_view'[\s\S]*views_count\s*=\s*views_count\s*\+\s*1/i,
  );

  const trackingStoreStart = storeSource.indexOf(
    "export async function insertLpTrackingEvent",
  );
  const trackingStoreEnd = storeSource.indexOf(
    "/** Contador-cache",
    trackingStoreStart,
  );
  const trackingStore = storeSource.slice(trackingStoreStart, trackingStoreEnd);
  assert.ok(trackingStoreStart >= 0 && trackingStoreEnd > trackingStoreStart);
  assert.match(
    trackingStore,
    /\.rpc\(\s*"record_lp_tracking_event"/,
  );
  assert.doesNotMatch(trackingStore, /\.from\(EVENTS\)\s*\.insert/);
  assert.doesNotMatch(trackRouteSource, /await bumpLpCounter\(/);
  assert.match(
    trackRouteSource,
    /isLpRenderContextStaleError\([\s\S]*status:\s*409/i,
  );
});


/**
 * O furo medido em 30/08/2026. A migration 20260723090000 já revogava
 * `authenticated` das duas RPCs, mas a 20260820140000 — que vem DEPOIS na
 * apply-order — refaz ambas com `create or replace` e não repete os grants.
 * Quem tem a última palavra na ordem de aplicação é quem decide o privilégio
 * com que o banco fica, e por 10 dias a última palavra foi de uma migration
 * muda: dev ficou com `authenticated=X/postgres` nas duas, e um JWT de usuário
 * comum executava o corpo delas.
 *
 * Nenhum outro gate pega isso. `public.schema_signature()` hasheia
 * `pg_get_function_result | prosecdef | provolatile` — ACL não entra —, então o
 * check de drift dev x prod fica verde com os bancos divergindo em privilégio.
 */
test("o revoke de `authenticated` tem a última palavra nas RPCs públicas de LP", () => {
  const raizRepo = path.join(process.cwd(), "..", "..");
  const arquivos = applyOrder
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "" && !linha.startsWith("#"));

  /** Recorta um comando SQL inteiro, do verbo até o `;`, atravessando quebras de linha. */
  const comando = (sql: string, verbo: string, rpc: string): string | null => {
    const inicio = sql.toLowerCase().indexOf(`${verbo} public.${rpc}`);
    if (inicio < 0) return null;
    const fim = sql.indexOf(";", inicio);
    return fim < 0 ? null : sql.slice(inicio, fim).toLowerCase();
  };

  // Só conta quem cria a função ou mexe no privilégio dela: citação em
  // comentário de outra migration não deve obrigar ninguém a repetir o revoke.
  const VERBOS = [
    "create or replace function",
    "revoke all on function",
    "grant execute on function",
  ];

  for (const rpc of ["confirm_lp_capture", "record_lp_tracking_event"]) {
    const tocam = arquivos.filter((rel) => {
      const abs = path.join(raizRepo, rel);
      if (!existsSync(abs)) return false;
      const sql = readFileSync(abs, "utf8");
      return VERBOS.some((verbo) => comando(sql, verbo, rpc) !== null);
    });
    assert.ok(tocam.length > 0, `nenhuma migration da apply-order define ${rpc}`);

    const ultima = tocam[tocam.length - 1] as string;
    const sql = readFileSync(path.join(raizRepo, ultima), "utf8");

    const revoke = comando(sql, "revoke all on function", rpc);
    assert.ok(
      revoke !== null && revoke.includes("authenticated"),
      `A última migration da apply-order que mexe em ${rpc} é ${ultima}, e ela não ` +
        `revoga EXECUTE de authenticated. A função é security definer e recebe ` +
        `p_tenant_id como PARÂMETRO: sem o revoke, qualquer usuário logado chama ` +
        `/rest/v1/rpc/${rpc} com o tenant de outro lojista e injeta lead e evento ` +
        `de funil na base dele.`,
    );

    const grant = comando(sql, "grant execute on function", rpc);
    assert.ok(
      grant !== null && grant.includes("service_role"),
      `A última migration que mexe em ${rpc} (${ultima}) revoga mas não devolve ` +
        `EXECUTE para service_role — a captura de lead pararia de gravar.`,
    );
  }
});
