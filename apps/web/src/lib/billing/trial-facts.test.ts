import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readTrialFacts } from "./trial-facts";

type Resposta = { data?: unknown; error?: unknown };
type Filtro = [coluna: string, valor: unknown];

const ORG_OK: Resposta = { data: { trial_subscription_id: null }, error: null };

/**
 * Fake do encadeamento que `readTrialFacts` usa, e so dele. Registra os `.eq()` de
 * cada tabela: o service-role ignora RLS, entao esses filtros SAO o isolamento entre
 * tenants — um fake que nao os registrasse passaria mesmo se algum sumisse.
 */
function fakeSupabase(opts: { org: Resposta; sub: Resposta }) {
  const filtros: Record<string, Filtro[]> = { organizations: [], subscriptions: [] };
  const colunas: Record<string, string> = {};
  const client = {
    from(tabela: string) {
      const resposta = tabela === "organizations" ? opts.org : opts.sub;
      const cadeia = {
        select: (cols: string) => {
          colunas[tabela] = cols;
          return cadeia;
        },
        eq: (coluna: string, valor: unknown) => {
          filtros[tabela].push([coluna, valor]);
          return cadeia;
        },
        maybeSingle: async () => resposta,
      };
      return cadeia;
    },
  } as unknown as SupabaseClient;

  return { client, filtros, colunas };
}

test("cada leitura filtra pelo tenant: é isso que isola as contas, não o RLS", async () => {
  const { client, filtros } = fakeSupabase({ org: ORG_OK, sub: { data: null, error: null } });
  await readTrialFacts(client, "T");

  assert.deepEqual(filtros.organizations, [
    ["id", "T"],
    ["tenant_id", "T"],
  ]);
  assert.deepEqual(filtros.subscriptions, [["tenant_id", "T"]]);
});

test("erro ao ler a organização sobe, em vez de virar 'nunca testou'", async () => {
  const falha = new Error("org fora do ar");
  const { client } = fakeSupabase({ org: { data: null, error: falha }, sub: { data: null, error: null } });
  await assert.rejects(readTrialFacts(client, "T"), falha);
});

test("erro ao ler a assinatura sobe, em vez de virar 'nunca assinou'", async () => {
  const falha = new Error("subscriptions fora do ar");
  const { client } = fakeSupabase({ org: ORG_OK, sub: { data: null, error: falha } });
  await assert.rejects(readTrialFacts(client, "T"), falha);
});

test("organização inexistente sobe: sem a linha, 'nunca testou' seria só falta de dado", async () => {
  const { client } = fakeSupabase({ org: { data: null, error: null }, sub: { data: null, error: null } });
  await assert.rejects(readTrialFacts(client, "T"), /nao encontrada/);
});

test("mapeia plano, metadata e o id do teste já consumido", async () => {
  const { client } = fakeSupabase({
    org: { data: { trial_subscription_id: "sub_trial" }, error: null },
    sub: {
      data: {
        status: "canceled",
        stripe_subscription_id: "sub_1",
        current_period_end: "2026-10-10T00:00:00Z",
        metadata: { cancel_reason: "trial_card_reused" },
        cancel_at_period_end: true,
        plans: { name: "Growth", price_cents: 19700 },
      },
      error: null,
    },
  });

  assert.deepEqual(await readTrialFacts(client, "T"), {
    trialSubscriptionId: "sub_trial",
    subscription: {
      status: "canceled",
      stripeSubscriptionId: "sub_1",
      periodEnd: "2026-10-10T00:00:00Z",
      cancelReason: "trial_card_reused",
      planName: "Growth",
      priceCents: 19700,
      cancelAtPeriodEnd: true,
    },
  });
});

test("sem linha de assinatura, subscription é null", async () => {
  const { client } = fakeSupabase({ org: ORG_OK, sub: { data: null, error: null } });
  assert.deepEqual(await readTrialFacts(client, "T"), { trialSubscriptionId: null, subscription: null });
});

test("lê cancel_at_period_end: sem ele, teste cancelado no portal ainda anunciaria cobrança", async () => {
  const { client, colunas } = fakeSupabase({ org: ORG_OK, sub: { data: null, error: null } });
  await readTrialFacts(client, "T");
  assert.match(colunas.subscriptions, /\bcancel_at_period_end\b/);
});
