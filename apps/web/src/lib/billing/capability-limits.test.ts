import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITY_LIMIT_KEY,
  CAPABILITY_TABLE,
  BLOCKED_LIMITS,
  hasReachedLimit,
  resolveLimitCheck,
  tenantLimitsFrom,
  type PlanCapability,
} from "./capability-limits";

/**
 * O bug que este arquivo existe para não deixar voltar: `campaigns:*` contava
 * `campaigns`, mas POST /api/campanhas grava em `campaign_groups`. Em produção
 * `public.campaigns` está vazia desde sempre, então a contagem dava 0 e o teto
 * nunca era atingido em plano pago.
 */
test("campanha conta a tabela que a rota realmente alimenta", () => {
  assert.equal(CAPABILITY_TABLE["campaigns:create"], "campaign_groups");
  assert.equal(CAPABILITY_TABLE["campaigns:send"], "campaign_groups");
});

test("as demais capabilities seguem apontando para a tabela verificada em prod", () => {
  assert.equal(CAPABILITY_TABLE["instances:create"], "instances");
  assert.equal(CAPABILITY_TABLE["team_members:invite"], "memberships");
});

test("plano sem o limite definido nao bloqueia", () => {
  assert.deepEqual(resolveLimitCheck("campaigns:create", {}), { kind: "allow" });
});

test("limite negativo e ilimitado", () => {
  assert.deepEqual(resolveLimitCheck("campaigns:create", { campaigns: -1 }), { kind: "allow" });
});

test("limite positivo manda contar a tabela certa", () => {
  assert.deepEqual(resolveLimitCheck("campaigns:create", { campaigns: 10 }), {
    kind: "count",
    table: "campaign_groups",
    limit: 10,
  });
});

// FREE tem campaigns: 0. Antes o bloqueio saía por acidente (contagem sempre 0
// satisfazia 0 >= 0); agora sai porque a regra diz isso.
test("limite zero com tabela ainda bloqueia, contando de verdade", () => {
  const check = resolveLimitCheck("campaigns:create", { campaigns: 0 });
  assert.deepEqual(check, { kind: "count", table: "campaign_groups", limit: 0 });
  assert.equal(hasReachedLimit(0, 0), true);
});

test("capability sem tabela e limite zero bloqueia direto", () => {
  assert.deepEqual(resolveLimitCheck("uploads:create", { uploads_mb: 0 }), { kind: "block" });
});

test("capability sem tabela e limite positivo passa (nao ha o que contar)", () => {
  assert.deepEqual(resolveLimitCheck("uploads:create", { uploads_mb: 1024 }), { kind: "allow" });
});

test("o teto e atingido no limite, nao depois dele", () => {
  assert.equal(hasReachedLimit(9, 10), false);
  assert.equal(hasReachedLimit(10, 10), true);
  assert.equal(hasReachedLimit(11, 10), true);
});

// Uma capability nova sem tabela vira teto que nunca aplica — silenciosamente.
test("toda capability que consome recurso contavel tem tabela", () => {
  const contaveis: PlanCapability[] = [
    "instances:create",
    "campaigns:create",
    "campaigns:send",
    "team_members:invite",
  ];

  for (const cap of contaveis) {
    assert.ok(CAPABILITY_TABLE[cap], `${cap} ficou sem tabela para contar`);
  }
});

// ── Teto de quem nao tem assinatura ──────────────────────────────────────────

/**
 * Dois defeitos diferentes moram nesta secao, e o segundo so existiu porque o
 * primeiro foi consertado pela metade:
 *
 * 1. `getTenantLimits` devolvia `{}` para tenant sem assinatura, e `{}` faz
 *    `resolveLimitCheck` responder `allow` para TUDO — quem nao pagava ficava
 *    mais solto que qualquer cliente pagante.
 * 2. O conserto mandou "sem assinatura" para o teto do plano FREE, com fallback
 *    embutido espelhando o FREE de producao. Correto enquanto o FREE existia.
 *    A decisao paid-first de 27/08/2026 tira o FREE do catalogo — e o fallback
 *    passaria a ser o proprio gratuito, ressuscitado em codigo, liberando 1
 *    instancia de WhatsApp para quem nunca pagou.
 */
test("sem assinatura o teto e bloqueio, nao o plano FREE", () => {
  assert.deepEqual(tenantLimitsFrom({ subscription: null }), BLOCKED_LIMITS);
});

test("bloqueio nao e teto vazio — teto vazio E o bug original", () => {
  assert.notDeepEqual(BLOCKED_LIMITS, {}, "objeto vazio libera tudo em resolveLimitCheck");

  for (const cap of Object.keys(CAPABILITY_LIMIT_KEY) as PlanCapability[]) {
    const check = resolveLimitCheck(cap, BLOCKED_LIMITS);
    assert.notEqual(check.kind, "allow", `${cap} ficou liberada para quem nao tem assinatura`);

    // Nao basta `kind !== "allow"`: com teto 1 o kind ainda e "count", e o
    // mutante que devolvesse 1 em qualquer chave sobrevivia a assercao fraca.
    // O invariante de "bloqueado" e recusar o PRIMEIRO uso, com o tenant em zero.
    if (check.kind === "count") {
      assert.ok(hasReachedLimit(0, check.limit), `${cap} deixa passar o primeiro uso`);
    }
  }
});

test("o bloqueio cobre toda chave de limite — chave nova nao pode nascer ilimitada", () => {
  // `resolveLimitCheck` responde `allow` para limite `undefined`. Se alguem
  // acrescentar uma chave a `Limits`/`CAPABILITY_LIMIT_KEY` sem por aqui, essa
  // capability fica sem teto para quem nao assinou — a regressao que este
  // arquivo existe para impedir, e que nenhum outro teste pegaria.
  for (const chave of Object.values(CAPABILITY_LIMIT_KEY)) {
    assert.notEqual(
      BLOCKED_LIMITS[chave],
      undefined,
      `${chave} ficou de fora de BLOCKED_LIMITS e seria ilimitada`,
    );
  }
});

test("instancia de WhatsApp fica bloqueada — e o custo que o modo demonstracao nao pode ter", () => {
  // Nao e detalhe de contagem: instancia conectada custa RAM, fila de suporte e
  // risco de ban do numero. O FREE dava 1; o bloqueio da 0.
  const check = resolveLimitCheck("instances:create", BLOCKED_LIMITS);
  assert.deepEqual(check, { kind: "count", table: "instances", limit: 0 });
  assert.equal(hasReachedLimit(0, 0), true);
});

test("assinatura ativa manda, e o bloqueio nao interfere", () => {
  const pago = { funnels: 100, contacts: 100000, campaigns: 500 };
  assert.deepEqual(tenantLimitsFrom({ subscription: { limits: pago } }), pago);
});

test("plano que nao declara limites segue ilimitado — e escolha do catalogo, nao ausencia de plano", () => {
  // Diferente de "sem assinatura": aqui existe assinatura e o plano optou por
  // nao pôr teto. Tratar isso como bloqueio derrubaria cliente pagante.
  assert.deepEqual(tenantLimitsFrom({ subscription: { limits: null } }), {});
  assert.deepEqual(tenantLimitsFrom({ subscription: {} }), {});
});
