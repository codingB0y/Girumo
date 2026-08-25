import assert from "node:assert/strict";
import test from "node:test";
import { FREE_PLAN_CODE, normalizePlanCode, SEED_PLAN_CATALOG } from "./plan-codes";
import {
  CAPABILITY_LIMIT_KEY,
  hasReachedLimit,
  resolveLimitCheck,
  tenantLimitsFrom,
} from "./capability-limits";

test("normalizePlanCode leva as tres grafias do repo para a mesma forma", () => {
  // "free" era o que admin/tenants/create procurava e admin/seed gravava;
  // "FREE" e o que os dois bancos tem. `=` em text no Postgres e case-sensitive,
  // entao a busca falhava em silencio e o tenant nascia sem assinatura.
  assert.equal(normalizePlanCode("free"), FREE_PLAN_CODE);
  assert.equal(normalizePlanCode("Free"), FREE_PLAN_CODE);
  assert.equal(normalizePlanCode("  free  "), FREE_PLAN_CODE);
  assert.equal(normalizePlanCode("performance-max"), "PERFORMANCE_MAX");
  assert.equal(normalizePlanCode("performance max"), "PERFORMANCE_MAX");
});

test("normalizePlanCode nao explode com entrada ausente", () => {
  assert.equal(normalizePlanCode(null), "");
  assert.equal(normalizePlanCode(undefined), "");
});

test("todo plano semeado ja esta na forma canonica", () => {
  // Se algum codigo do catalogo nao for canonico, o lookup por
  // `planIds[normalizePlanCode(code)]` em admin/seed volta undefined e o seed
  // pula a criacao da subscription — em silencio, com um `continue`.
  for (const plan of SEED_PLAN_CATALOG) {
    assert.equal(plan.code, normalizePlanCode(plan.code), `${plan.code} nao esta canonico`);
  }
});

test("o catalogo semeado tem FREE e nao repete codigo", () => {
  const codes = SEED_PLAN_CATALOG.map((plan) => plan.code);
  assert.ok(codes.includes(FREE_PLAN_CODE), "sem FREE, tenant novo fica sem plano para receber");
  assert.equal(new Set(codes).size, codes.length, "codigo repetido viola plans_code_unique");
});

test("nenhum plano semeado nasce ilimitado por esquecer limits", () => {
  // Esta e a armadilha que o conserto dos codigos quase abriu. `plans.limits` e
  // NOT NULL DEFAULT '{}', e `tenantLimitsFrom` respeita `{}` como "sem teto"
  // quando HA assinatura — de proposito, para nao rebaixar cliente pagante.
  // Entao semear plano sem `limits` e dar assinatura a alguem equivale a
  // entregar acesso ilimitado. Antes isso nao aparecia so porque o bug de caixa
  // impedia o seed de criar qualquer assinatura.
  for (const plan of SEED_PLAN_CATALOG) {
    const limits = tenantLimitsFrom({ subscription: { limits: plan.limits }, freePlan: null });
    assert.notDeepEqual(limits, {}, `${plan.code} sem limits libera tudo para quem assina`);

    for (const chave of Object.values(CAPABILITY_LIMIT_KEY)) {
      assert.notEqual(limits[chave], undefined, `${plan.code} nao declara ${chave}`);
    }
  }
});

test("o FREE semeado recusa ja a PRIMEIRA campanha, igual ao FREE de producao", () => {
  const free = SEED_PLAN_CATALOG.find((plan) => plan.code === FREE_PLAN_CODE);
  const limits = tenantLimitsFrom({ subscription: { limits: free?.limits }, freePlan: null });
  const check = resolveLimitCheck("campaigns:create", limits);

  // Cobrar o limite, nao so `kind !== "allow"`: com `campaigns: 500` o kind
  // continua sendo "count" e a assercao fraca passava — o mutante sobreviveu na
  // primeira versao deste teste. O que define o FREE e recusar a campanha de
  // numero um, com o tenant ainda em zero.
  assert.equal(check.kind, "count");
  assert.ok(
    check.kind === "count" && hasReachedLimit(0, check.limit),
    "com zero campanhas o FREE ja tem que barrar; limite > 0 deixa o seed mais generoso que producao",
  );
});
