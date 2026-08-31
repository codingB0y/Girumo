import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * O furo medido em 31/08/2026, irmão do #190 (a89e86ab) mas do lado da LEITURA.
 *
 * `funnel_tenant_matrix()` devolve numa chamada só o `tenant_id`, o `name` (que
 * carrega e-mail de cliente) e os marcos do funil de TODAS as organizações;
 * `funnel_event_counts()` devolve o funil agregado sem recorte por tenant. As
 * duas são `security definer` e não filtram por quem chamou — foram escritas
 * para rodar sob service-role, no admin. Um JWT `authenticated` de usuário comum
 * lia a base de clientes inteira por /rest/v1/rpc/funnel_tenant_matrix.
 *
 * A CAUSA NÃO É ESQUECIMENTO PONTUAL, e é por isso que este teste é genérico em
 * vez de listar as funções na mão. O default privilege do grantor `postgres`
 * para function em `public` é
 *   `postgres=X | authenticated=X | service_role=X`
 * — medido nos dois bancos no dia. `postgres` é a conexão que aplica migração,
 * então TODA função nova de `public` nasce executável por `authenticated`. O
 * event trigger `ensure_anon_revoked` não alcança: o corpo dele revoga
 * `from anon, public`, nunca `authenticated`. Ou seja, a próxima função
 * `security definer` que alguém escrever nasce com o mesmo furo, em silêncio.
 *
 * Nenhum outro gate pega. `public.schema_signature()` hasheia
 * `pg_get_function_result | prosecdef | provolatile`; ACL não entra, então o
 * check de drift fica verde com os dois bancos vazando igual.
 */

const raizRepo = path.join(process.cwd(), "..", "..");
const applyOrder = readFileSync(
  path.join(raizRepo, "deploy", "supabase", "apply-order.txt"),
  "utf8",
);

const migrations = applyOrder
  .split(/\r?\n/)
  .map((linha) => linha.trim())
  .filter((linha) => linha !== "" && !linha.startsWith("#"))
  .filter((rel) => existsSync(path.join(raizRepo, rel)))
  .map((rel) => ({ rel, sql: readFileSync(path.join(raizRepo, rel), "utf8").toLowerCase() }));

/**
 * Recorta TODOS os comandos daquele verbo sobre aquela função, cada um do verbo
 * até o `;`, atravessando quebras de linha. Precisa ser todos, não o primeiro:
 * 20260822180000_schema_signature.sql revoga em três statements separados
 * (`from public;`, `from anon;`, `from authenticated;`), e ler só o primeiro
 * acusaria falta de revoke onde ele existe.
 */
function comandos(sql: string, verbo: string, fn: string): string[] {
  const alvo = `${verbo} public.${fn}`;
  const achados: string[] = [];
  for (let i = sql.indexOf(alvo); i >= 0; i = sql.indexOf(alvo, i + 1)) {
    // `public.foo` não pode casar com `public.foo_bar`.
    const depois = sql.slice(i + alvo.length).trimStart();
    if (!depois.startsWith("(")) continue;
    const fim = sql.indexOf(";", i);
    if (fim >= 0) achados.push(sql.slice(i, fim));
  }
  return achados;
}

/** O primeiro comando, ou null — para os casos em que basta saber se existe. */
function comando(sql: string, verbo: string, fn: string): string | null {
  return comandos(sql, verbo, fn)[0] ?? null;
}

/**
 * Nomes de função declarados `security definer` em alguma migration da
 * apply-order. Olha só o cabeçalho (da assinatura até o início do corpo) para
 * não confundir com um `security definer` de outra função no mesmo arquivo.
 */
function definersDeclaradas(): Set<string> {
  const achadas = new Set<string>();
  for (const { sql } of migrations) {
    const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/g;
    for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
      const nome = m[1] as string;
      const corpo = sql.indexOf("as $", m.index);
      const cabecalho = sql.slice(m.index, corpo < 0 ? m.index + 800 : corpo);
      if (cabecalho.includes("security definer")) achadas.add(nome);
    }
  }
  return achadas;
}

const VERBOS_QUE_TOCAM = [
  "create or replace function",
  "create function",
  "revoke all on function",
  "revoke execute on function",
  "grant execute on function",
  "drop function",
];

test("nenhuma função `security definer` de public fica executável por `authenticated`", () => {
  const definers = definersDeclaradas();
  assert.ok(
    definers.size > 0,
    "não achei nenhuma função security definer na apply-order — o parser quebrou",
  );

  const semRevoke: string[] = [];

  for (const fn of [...definers].sort()) {
    const tocam = migrations.filter(({ sql }) =>
      VERBOS_QUE_TOCAM.some((verbo) => comando(sql, verbo, fn) !== null),
    );
    if (tocam.length === 0) continue;

    const ultima = tocam[tocam.length - 1] as (typeof migrations)[number];

    // Função removida no fim da vida não precisa de revoke.
    if (comando(ultima.sql, "drop function", fn) !== null) continue;

    const revokes = [
      ...comandos(ultima.sql, "revoke all on function", fn),
      ...comandos(ultima.sql, "revoke execute on function", fn),
    ];

    if (!revokes.some((r) => r.includes("authenticated"))) {
      semRevoke.push(`${fn}  (última que a toca: ${ultima.rel})`);
    }
  }

  assert.deepEqual(
    semRevoke,
    [],
    "Estas funções `security definer` de public não têm `revoke ... from authenticated` " +
      "na ÚLTIMA migration da apply-order que mexe nelas — quem tem a última palavra na " +
      "ordem de aplicação é quem decide o privilégio com que o banco fica. Como o default " +
      "privilege do grantor `postgres` concede EXECUTE a `authenticated` em toda função " +
      "nova de public, sem o revoke explícito elas ficam chamáveis por qualquer usuário " +
      "logado em /rest/v1/rpc/<nome>, com os privilégios do dono:\n  " +
      semRevoke.join("\n  "),
  );
});

/**
 * O revoke sozinho não basta: as duas RPCs do funil são lidas pelo admin sob
 * service-role. Se alguém revogar e esquecer de devolver, a tela do admin passa
 * a estourar em vez de vazar — melhor, mas ainda quebrado.
 */
test("as RPCs do funil continuam executáveis por `service_role`", () => {
  for (const fn of ["funnel_event_counts", "funnel_tenant_matrix"]) {
    const tocam = migrations.filter(({ sql }) =>
      VERBOS_QUE_TOCAM.some((verbo) => comando(sql, verbo, fn) !== null),
    );
    const ultima = tocam[tocam.length - 1] as (typeof migrations)[number];

    const grants = comandos(ultima.sql, "grant execute on function", fn);
    assert.ok(
      grants.some((g) => g.includes("service_role")),
      `A última migration que mexe em ${fn} (${ultima.rel}) revoga mas não devolve ` +
        `EXECUTE para service_role. Os call-sites são getFunnelMetrics e ` +
        `getTenantFunnelMatrix em src/lib/analytics/funnel-events.ts, ambos com ` +
        `getSupabaseAdmin(): o funil do admin pararia de carregar.`,
    );
  }
});
