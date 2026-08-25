import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITY_LIMIT_KEY,
  CAPABILITY_TABLE,
  FREE_FALLBACK_LIMITS,
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
 * O defeito: `getTenantLimits` devolvia `{}` para tenant sem assinatura, e `{}`
 * faz `resolveLimitCheck` responder `allow` para TUDO. Quem nao paga ficava sem
 * teto nenhum — mais solto que qualquer cliente pagante.
 */
test("tenant sem assinatura recebe o teto do plano FREE, nao teto nenhum", () => {
  const free = { funnels: 1, contacts: 250, campaigns: 0 };
  assert.deepEqual(tenantLimitsFrom({ subscription: null, freePlan: free }), free);
});

test("sem assinatura e sem catalogo, cai no fallback embutido em vez de liberar tudo", () => {
  // Catalogo indisponivel nao pode virar barra livre: o fallback e a ultima
  // linha, e por isso ele e restritivo.
  assert.deepEqual(tenantLimitsFrom({ subscription: null, freePlan: null }), FREE_FALLBACK_LIMITS);
  assert.notDeepEqual(FREE_FALLBACK_LIMITS, {}, "fallback vazio seria ilimitado — o proprio bug");
});

test("catalogo com limits vazio nao vale como teto — cai no fallback", () => {
  // `plans.limits` e NOT NULL DEFAULT '{}'::jsonb, entao o catalogo NUNCA
  // devolve null: devolve `{}`. Como `??` so captura null/undefined, aceitar
  // esse `{}` deixava o tenant sem assinatura ilimitado de novo — o defeito
  // voltando pela porta dos fundos. `api/admin/seed/route.ts` insere planos sem
  // `limits`, entao a linha vazia nao e hipotetica.
  assert.deepEqual(tenantLimitsFrom({ subscription: null, freePlan: {} }), FREE_FALLBACK_LIMITS);
});

test("o fallback cobre toda chave de limite — chave nova nao pode nascer ilimitada", () => {
  // `resolveLimitCheck` responde `allow` para limite `undefined`. Se alguem
  // acrescentar uma chave a `Limits`/`CAPABILITY_LIMIT_KEY` sem por no fallback,
  // essa capability fica sem teto para quem cai aqui — a regressao que este
  // arquivo inteiro existe para impedir, e que nenhum outro teste pegaria.
  for (const chave of Object.values(CAPABILITY_LIMIT_KEY)) {
    assert.notEqual(
      FREE_FALLBACK_LIMITS[chave],
      undefined,
      `${chave} ficou de fora de FREE_FALLBACK_LIMITS e seria ilimitada`,
    );
  }
});

test("o fallback nega o que o FREE nega e nao inventa folga", () => {
  const check = resolveLimitCheck("campaigns:create", FREE_FALLBACK_LIMITS);
  assert.notEqual(check.kind, "allow", "campanha no fallback nao pode ser liberada");
});

test("assinatura ativa manda, e o catalogo do FREE nao interfere", () => {
  const pago = { funnels: 100, contacts: 100000, campaigns: 500 };
  assert.deepEqual(
    tenantLimitsFrom({ subscription: { limits: pago }, freePlan: { funnels: 1, campaigns: 0 } }),
    pago,
  );
});

test("plano que nao declara limites segue ilimitado — e escolha do catalogo, nao ausencia de plano", () => {
  // Diferente de "sem assinatura": aqui existe assinatura e o plano optou por
  // nao pôr teto. Tratar isso como FREE rebaixaria cliente pagante. E por isso
  // que `{}` e recusado no ramo SEM assinatura e aceito neste — houve escolha.
  assert.deepEqual(tenantLimitsFrom({ subscription: { limits: null }, freePlan: { campaigns: 0 } }), {});
  assert.deepEqual(tenantLimitsFrom({ subscription: {}, freePlan: { campaigns: 0 } }), {});
});
