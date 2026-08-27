import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { provisionEntrySubscription } from "./entry-subscription";

type Resposta = { data?: unknown; error?: unknown };

/**
 * Fake do encadeamento que o helper usa, e so dele. Registra o insert para as
 * assercoes: o que importa nao e so o desfecho devolvido, e sim se a linha de
 * assinatura foi (ou nao) gravada.
 */
function fakeSupabase(opts: { plan: Resposta; insert?: Resposta }) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === "plans") {
        return {
          select: () => ({
            ilike: () => ({ maybeSingle: async () => opts.plan }),
          }),
        };
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return opts.insert ?? { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, inserts };
}

/** Silencia o log do helper sem perder o que ele registrou. */
async function semRuido<T>(fn: () => Promise<T>): Promise<T> {
  const { error, info } = console;
  console.error = () => {};
  console.info = () => {};
  try {
    return await fn();
  } finally {
    console.error = error;
    console.info = info;
  }
}

test("achando o plano de entrada, a conta nasce assinada e com a origem gravada", async () => {
  const { client, inserts } = fakeSupabase({ plan: { data: { id: "plan-1" }, error: null } });
  const r = await semRuido(() => provisionEntrySubscription(client, "tenant-1", "signup"));

  assert.deepEqual(r, { kind: "subscribed", planId: "plan-1" });
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0], {
    tenant_id: "tenant-1",
    plan_id: "plan-1",
    status: "free",
    metadata: { source: "signup" },
  });
});

/**
 * O caminho que passa a ser NORMAL depois de o FREE sair do catalogo. Antes
 * deste modulo ele era o `else` invisivel de um `if (plano)`.
 */
test("sem plano de entrada no catalogo, a conta nasce bloqueada — e isso tem nome", async () => {
  const { client, inserts } = fakeSupabase({ plan: { data: null, error: null } });
  const r = await semRuido(() => provisionEntrySubscription(client, "tenant-2", "google_oauth"));

  assert.deepEqual(r, { kind: "blocked", reason: "plan_missing" });
  assert.equal(inserts.length, 0, "nao pode gravar assinatura apontando para plano nenhum");
});

/**
 * Falha de leitura NAO pode se confundir com catalogo vazio. As duas produziam
 * o mesmo silencio antes: `const { data } = await ...` descartava o erro.
 */
test("consulta que falha e desconhecido, nao 'nao existe'", async () => {
  const { client, inserts } = fakeSupabase({ plan: { data: null, error: { message: "boom" } } });
  const r = await semRuido(() => provisionEntrySubscription(client, "tenant-3", "admin"));

  assert.deepEqual(r, { kind: "blocked", reason: "lookup_failed" });
  assert.equal(inserts.length, 0);
});

test("insert que falha nao vira conta 'assinada'", async () => {
  const { client } = fakeSupabase({
    plan: { data: { id: "plan-1" }, error: null },
    insert: { error: { message: "conflito" } },
  });
  const r = await semRuido(() => provisionEntrySubscription(client, "tenant-4", "signup"));

  assert.deepEqual(r, { kind: "blocked", reason: "insert_failed" });
});

test("cada motivo de bloqueio e distinguivel — senao nao da para diagnosticar depois", async () => {
  const casos: Array<[Resposta, string]> = [
    [{ data: null, error: null }, "plan_missing"],
    [{ data: null, error: { message: "x" } }, "lookup_failed"],
  ];

  for (const [plan, esperado] of casos) {
    const { client } = fakeSupabase({ plan });
    const r = await semRuido(() => provisionEntrySubscription(client, "t", "signup"));
    assert.equal(r.kind === "blocked" && r.reason, esperado);
  }
});

// ── A regressao que este arquivo existe para impedir ─────────────────────────

const API = join(import.meta.dirname, "..", "..", "app", "api");

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) arquivos(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

/**
 * Le o codigo-fonte de proposito: a assercao e sobre o call-site, e nenhum
 * type-check pega uma quarta porta de entrada nascendo com o insert inline.
 *
 * A regra e por FORMA, nao por lista de arquivos: quem cria organizacao nao
 * monta assinatura sozinho. Uma porta nova e pega automaticamente, que e
 * exatamente o que faltou quando o login com Google virou a terceira.
 */
test("nenhuma rota que cria organizacao monta a assinatura por conta propria", () => {
  const portas = arquivos(API)
    // `admin/seed/*` cria organizacao, mas nao e porta de entrada de cliente:
    // sao geradores de ambiente que montam tenants sinteticos de proposito em
    // planos e status variados (`statuses[i % statuses.length]`, `Math.random()`)
    // — exatamente o que este helper NAO deve uniformizar. Ficam de fora com
    // nome, e nao por acidente de regex.
    .filter((f) => {
      const partes = relative(API, f).split(sep);
      return !(partes[0] === "admin" && partes[1] === "seed");
    })
    .filter((f) => {
      const src = readFileSync(f, "utf8").replace(/\s+/g, "");
      return src.includes('.from("organizations").insert(');
    });

  assert.ok(portas.length >= 3, `esperava as 3 portas de entrada, achei ${portas.length}`);

  for (const porta of portas) {
    const src = readFileSync(porta, "utf8").replace(/\s+/g, "");
    assert.ok(
      !src.includes('.from("subscriptions").insert('),
      `${porta} monta a assinatura inline; use provisionEntrySubscription`,
    );
    assert.ok(
      src.includes("provisionEntrySubscription("),
      `${porta} cria organizacao mas nao define o estado de cobranca da conta`,
    );
  }
});

test("plano escolhido pelo admin entra como active, sem consultar o catalogo", async () => {
  const { client, inserts } = fakeSupabase({
    // Se a busca fosse feita, este erro derrubaria o caso — a assercao de que
    // ela NAO acontece esta no fake, nao so na leitura do codigo.
    plan: { data: null, error: { message: "nao deveria consultar" } },
  });
  const r = await semRuido(() =>
    provisionEntrySubscription(client, "tenant-5", "admin", { chosenPlanId: "plan-growth" }),
  );

  assert.deepEqual(r, { kind: "subscribed", planId: "plan-growth" });
  assert.equal(inserts[0]?.status, "active", "plano escolhido nao e plano de entrada");
});
