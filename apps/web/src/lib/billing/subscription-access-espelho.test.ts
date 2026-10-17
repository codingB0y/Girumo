import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { subscriptionAccess } from "./subscription-access";

/**
 * "A loja tem plano?" é decidido em dois lugares: `subscriptionAccess` (painel,
 * rotas, auto-grow) e `app.tenant_concede_plano` no banco (agendamento que o
 * worker promove sozinho). Mudar um lado só faz o lojista ver "plano ativo" e o
 * agendado não sair — ou o ex-cliente seguir disparando, que é o C17 de volta.
 *
 * Sem banco: lê a regra da ÚLTIMA migração da apply-order que define a função,
 * monta o predicado do SQL em TS e compara com `subscriptionAccess` em toda
 * combinação de status, status do Stripe, fim do período e cancelamento.
 */

const raizRepo = path.join(process.cwd(), "..", "..");
const ASSINATURA = "create or replace function app.tenant_concede_plano(";

function corpoDaUltimaDefinicao(): { rel: string; corpo: string } {
  const definicoes = readFileSync(path.join(raizRepo, "deploy", "supabase", "apply-order.txt"), "utf8")
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "" && !linha.startsWith("#"))
    .filter((rel) => existsSync(path.join(raizRepo, rel)))
    .map((rel) => ({ rel, sql: readFileSync(path.join(raizRepo, rel), "utf8").toLowerCase() }))
    .filter(({ sql }) => sql.includes(ASSINATURA));
  const ultima = definicoes.at(-1);
  assert.ok(ultima, "nenhuma migração da apply-order define app.tenant_concede_plano");
  const inicio = ultima.sql.indexOf("$$", ultima.sql.indexOf(ASSINATURA)) + 2;
  return { rel: ultima.rel, corpo: ultima.sql.slice(inicio, ultima.sql.indexOf("$$", inicio)) };
}

/** `'a', 'b'` → {a, b}. */
const rotulos = (lista: string) => new Set(lista.split(",").map((r) => r.trim().replace(/^'|'$/g, "")));

/**
 * A forma inteira do corpo, com espaço normalizado. Condição nova no SQL que este
 * teste não modela tem que reprovar, não passar calada.
 */
const FORMA =
  /^select exists \( select 1 from public\.subscriptions s where s\.tenant_id = p_tenant and \( s\.status in \(([^)]*)\) or \( s\.status = '([a-z_]+)' and s\.metadata ->> 'stripe_status' in \(([^)]*)\) and s\.current_period_end > now\(\) \) \) \);$/;

function regraDoSql() {
  const { rel, corpo } = corpoDaUltimaDefinicao();
  const m = FORMA.exec(corpo.replace(/\s+/g, " ").trim());
  assert.ok(m, `${rel}: app.tenant_concede_plano mudou de forma — remodele este teste e confira o espelho com subscriptionAccess`);
  const [, direto, pendente, stripe] = m as unknown as [string, string, string, string];
  return { direto: rotulos(direto), pendente, stripe: rotulos(stripe) };
}

// Valores do enum public.subscription_status (medido em prod em 17/10/2026).
const STATUS = ["free", "trialing", "active", "past_due", "canceled", "unpaid"];
const STRIPE = [null, "incomplete", "incomplete_expired", "active", "trialing", "past_due", "unpaid", "canceled", "paused"];
const AGORA = new Date("2026-10-17T12:00:00Z");
const FIM = [null, "2026-10-10T12:00:00Z", "2026-10-24T12:00:00Z"];

test("app.tenant_concede_plano concede exatamente quando subscriptionAccess concede", () => {
  const sql = regraDoSql();
  const divergentes: string[] = [];
  let concede = 0;

  for (const status of STATUS)
    for (const stripeStatus of STRIPE)
      for (const periodEnd of FIM)
        for (const cancelAtPeriodEnd of [false, true])
          for (const cancelReason of [null, "trial_card_reused"]) {
            const ts = subscriptionAccess({ status, stripeStatus, periodEnd, cancelAtPeriodEnd, cancelReason }, AGORA).grantsPlan;
            const banco =
              sql.direto.has(status) ||
              (status === sql.pendente &&
                stripeStatus !== null &&
                sql.stripe.has(stripeStatus) &&
                periodEnd !== null &&
                Date.parse(periodEnd) > AGORA.getTime());
            if (ts) concede++;
            if (ts !== banco) {
              divergentes.push(JSON.stringify({ status, stripeStatus, periodEnd, cancelAtPeriodEnd, cancelReason, ts, banco }));
            }
          }

  assert.deepEqual(divergentes, []);
  // Guarda do próprio teste: um parser que lesse conjuntos vazios passaria com tudo `false`.
  assert.ok(concede > 0, "nenhuma combinação concede: o teste não está comparando nada");
});

test("sem linha de assinatura: os dois lados negam", () => {
  assert.equal(subscriptionAccess({ status: null, stripeStatus: null, periodEnd: null }, AGORA).grantsPlan, false);
  // SQL: `exists` sem linha é false — e o corpo filtra pela loja do argumento.
  assert.match(corpoDaUltimaDefinicao().corpo, /where s\.tenant_id = p_tenant/);
});
