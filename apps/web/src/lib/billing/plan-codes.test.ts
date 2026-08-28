import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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

test("o catalogo semeado nao tem gratuito e nao repete codigo", () => {
  // `string[]` explicito: `as const` estreita para a uniao dos codigos pagos, e
  // comparar com FREE_PLAN_CODE deixaria de compilar — escondendo justamente a
  // assercao que garante que o gratuito nao voltou.
  const codes: string[] = SEED_PLAN_CATALOG.map((plan) => plan.code);
  // Invertido pelo paid-first (27/08/2026): banco novo NAO nasce com plano
  // gratuito. Antes a ausencia do FREE era o defeito — tenant novo ficava sem
  // plano para receber; agora ficar sem plano E o desfecho desejado, e quem
  // cuida dele e `provisionEntrySubscription` devolvendo `plan_missing`.
  assert.ok(!codes.includes(FREE_PLAN_CODE), "catalogo semeado nao pode ressuscitar o gratuito");
  assert.ok(codes.length >= 3, `esperava os tres planos pagos, achei ${codes.length}`);
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
    const limits = tenantLimitsFrom({ subscription: { limits: plan.limits } });
    assert.notDeepEqual(limits, {}, `${plan.code} sem limits libera tudo para quem assina`);

    for (const chave of Object.values(CAPABILITY_LIMIT_KEY)) {
      assert.notEqual(limits[chave], undefined, `${plan.code} nao declara ${chave}`);
    }
  }
});

test("todo plano semeado e pago e ja inclui campanha", () => {
  // Substitui o teste do FREE semeado, que existia para garantir que o gratuito
  // recusava a primeira campanha. Sem gratuito no catalogo, a garantia que
  // importa e a oposta: nenhum plano semeado pode ter teto zero de campanha,
  // senao um plano PAGO recusaria a campanha numero um.
  for (const plan of SEED_PLAN_CATALOG) {
    assert.ok(plan.price_cents > 0, `${plan.code} foi semeado com preco zero`);

    const check = resolveLimitCheck("campaigns:create", plan.limits);
    assert.equal(check.kind, "count");
    assert.ok(
      check.kind === "count" && !hasReachedLimit(0, check.limit),
      `${plan.code} recusa a primeira campanha`,
    );
  }
});

// ── A regressao que mora no seed ────────────────────────────────────────────

/**
 * Quem semeia plano usa o catalogo canonico, e nao uma lista propria.
 *
 * `admin/seed/dev` mantinha a sua: gravava `free` minusculo (o gratuito que o
 * paid-first matou) e, pior, gravava os planos SEM `limits`. Como `plans.limits`
 * e NOT NULL DEFAULT '{}' e `tenantLimitsFrom` respeita `{}` como "sem teto"
 * quando existe assinatura, todo tenant semeado saia ILIMITADO — o defeito que
 * o #162 fechou, voltando pela porta do seed, e so em banco vazio.
 *
 * Le o codigo-fonte porque a assercao e sobre o call-site: um array literal de
 * planos compila perfeitamente.
 */
test("nenhuma rota semeia plano com lista propria", () => {
  const SEED = join(import.meta.dirname, "..", "..", "app", "api", "admin", "seed");

  function arquivos(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) arquivos(full, acc);
      else if (/\.tsx?$/.test(entry)) acc.push(full);
    }
    return acc;
  }

  const semeadores = arquivos(SEED).filter((f) =>
    readFileSync(f, "utf8").replace(/\s+/g, "").includes('.from("plans").insert('),
  );

  assert.ok(semeadores.length >= 1, "esperava achar as rotas de seed de planos");

  for (const rota of semeadores) {
    const src = readFileSync(rota, "utf8");
    assert.ok(
      src.includes("SEED_PLAN_CATALOG"),
      `${rota} nao usa o catalogo canonico`,
    );
    // A assercao que importa. Conferir so o import deixava o mutante VIVO: o
    // import continua la mesmo quando a lista volta a ser inline logo abaixo.
    // `price_cents` e a assinatura de uma lista de planos escrita a mao — quem
    // usa o catalogo nao escreve preco nenhum nesta camada.
    assert.ok(
      !src.replace(/\s+/g, "").includes("price_cents:"),
      `${rota} escreve plano a mao; sem limits, o tenant semeado fica ilimitado`,
    );
  }
});
