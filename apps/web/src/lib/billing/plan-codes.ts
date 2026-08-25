/**
 * Código canônico de plano, e o catálogo mínimo para semear banco vazio.
 *
 * Vive separado de `plans.ts` porque aquele importa "server-only" e não roda sob
 * `tsx --test` — mesma divisão que existe entre `capability-limits.ts` e
 * `entitlements.ts`. Aqui fica só dado puro e a normalização; o que fala com
 * env var ou com o banco é lá.
 *
 * O motivo de este arquivo existir: o mesmo plano estava escrito de três jeitos
 * no repo, e a divergência falhava **em silêncio** nos dois sentidos, porque
 * `=` em text no Postgres é case-sensitive e o código sempre tratava "não achei"
 * como "não faz nada":
 *
 * - `admin/tenants/create` procurava `code = 'free'`. Produção tem `FREE`, então
 *   o `if (freePlan)` dava falso e a rota criava o tenant **sem assinatura**,
 *   sem erro nenhum. Era a origem das organizações sem subscription.
 * - `admin/seed` gravava `free`/`essencial`/`growth`/`performance` minúsculos e
 *   depois procurava `planIds['free']` — que contra linhas `FREE` dá `undefined`
 *   e caía num `continue`. O seed **nunca criava subscription** em dev nem prod.
 *
 * Enquanto tenant sem assinatura era ilimitado (até o PR #148), nada disso
 * aparecia. Depois que a ausência passou a valer o teto do FREE, virou tenant
 * nascendo com `campaigns: 0` e `team_members: 1`.
 */

/** Código canônico do plano gratuito. Use isto, nunca o literal. */
export const FREE_PLAN_CODE = "FREE";

export function normalizePlanCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Catálogo semeado num banco vazio. Espelha os 4 planos de produção
 * (25/08/2026), **com `limits`**.
 *
 * Os limites não são opcionais aqui. `plans.limits` é `NOT NULL DEFAULT '{}'`,
 * e `tenantLimitsFrom` respeita `{}` como "sem teto" quando existe assinatura —
 * é escolha do catálogo, e rebaixar puniria cliente pagante. Então semear plano
 * sem `limits` e depois dar assinatura a alguém equivale a entregar acesso
 * ilimitado. Antes deste arquivo isso não explodia só porque o seed nunca
 * conseguia criar assinatura nenhuma; ao consertar a busca, os dois têm que
 * andar juntos.
 */
export const SEED_PLAN_CATALOG = [
  {
    code: FREE_PLAN_CODE,
    name: "Free",
    price_cents: 0,
    limits: {
      funnels: 1,
      contacts: 250,
      campaigns: 0,
      uploads_mb: 100,
      team_members: 1,
      whatsapp_instances: 1,
    },
  },
  {
    code: "ESSENCIAL",
    name: "Essencial",
    price_cents: 19700,
    limits: {
      funnels: 5,
      contacts: 2000,
      campaigns: 10,
      uploads_mb: 1024,
      team_members: 3,
      whatsapp_instances: 1,
    },
  },
  {
    code: "GROWTH",
    name: "Growth",
    price_cents: 29700,
    limits: {
      funnels: 20,
      contacts: 10000,
      campaigns: 50,
      uploads_mb: 5120,
      team_members: 10,
      whatsapp_instances: 3,
    },
  },
  {
    code: "PERFORMANCE_MAX",
    name: "Operação",
    price_cents: 49700,
    limits: {
      funnels: 100,
      contacts: 100000,
      campaigns: 500,
      uploads_mb: 51200,
      team_members: 50,
      whatsapp_instances: 10,
    },
  },
] as const;
