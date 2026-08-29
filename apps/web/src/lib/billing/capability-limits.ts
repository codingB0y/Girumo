/**
 * Decide, para cada capability de plano, qual limite vale e qual tabela contar.
 *
 * Vive separado de entitlements.ts porque aquele importa "server-only" e não
 * roda sob `tsx --test`. Aqui fica só a decisão; a contagem no banco é lá.
 *
 * A tabela tem que ser a que a ROTA realmente alimenta. Contar uma tabela que
 * o caminho de escrita nunca toca não dá erro — dá um teto que nunca é
 * atingido, que é pior, porque parece que existe cobrança de limite.
 */

export type PlanCapability =
  | "instances:create"
  | "contacts:reach"
  | "campaigns:create"
  | "campaigns:send"
  | "funnels:create"
  | "uploads:create"
  | "team_members:invite";

export type Limits = {
  whatsapp_instances?: number;
  contacts?: number;
  campaigns?: number;
  funnels?: number;
  uploads_mb?: number;
  team_members?: number;
};

/**
 * Extras comprados na assinatura (add-on "celular adicional").
 *
 * Mora fora de `plans.limits` porque aquilo é catálogo GLOBAL — uma linha por
 * plano, compartilhada por todos os tenants. Guardar um extra de um cliente ali
 * aumentaria o teto de todo mundo no mesmo plano.
 */
export type LimitExtras = Partial<Record<keyof Limits, number>>;

export const CAPABILITY_LIMIT_KEY: Record<PlanCapability, keyof Limits> = {
  "instances:create": "whatsapp_instances",
  "contacts:reach": "contacts",
  "campaigns:create": "campaigns",
  "campaigns:send": "campaigns",
  "funnels:create": "funnels",
  "uploads:create": "uploads_mb",
  "team_members:invite": "team_members",
};

/**
 * Tabela contada por capability.
 *
 * `campaigns:*` conta `campaign_groups`, NÃO `campaigns`: POST /api/campanhas
 * grava via a store de campaign_groups, e `public.campaigns` está vazia desde
 * sempre em produção. Apontar para ela fazia o teto nunca ser atingido em
 * nenhum plano pago — o FREE só bloqueava por acidente aritmético (limite 0 e
 * contagem 0 satisfazem `0 >= 0`).
 *
 * `contacts:reach` conta `leads` pelo mesmo motivo, e a capability mudou de nome
 * junto. Ela se chamava `contacts:create`, apontava para `public.contacts` e
 * **não tinha call-site nenhum**: a tabela está vazia em produção desde sempre e
 * nenhuma rota escreve nela. O contato real do produto é o `lead` — a tela
 * `/painel/contatos` já lê `/api/leads`.
 *
 * O nome mudou porque o ponto de cobrança mudou, e isso é decisão de produto:
 * quem cria lead é o ENGINE, quando alguém entra num grupo. Cobrar teto ali
 * faria o registro de quem entrou ser descartado — a pessoa entra no grupo de
 * qualquer jeito, porque o WhatsApp não consulta plano. Seria perda silenciosa
 * do dado do próprio lojista, sem nada que ele pudesse fazer depois do fato.
 * O teto é cobrado no ALCANCE (envio de campanha): é ação dele, é o que produz
 * valor, e a saída — mudar de plano — resolve de verdade.
 */
export const CAPABILITY_TABLE: Partial<Record<PlanCapability, string>> = {
  "instances:create": "instances",
  "contacts:reach": "leads",
  "campaigns:create": "campaign_groups",
  "campaigns:send": "campaign_groups",
  "funnels:create": "funnels",
  "team_members:invite": "memberships",
};

export type LimitCheck =
  /** Plano não define esse limite, ou define como ilimitado. */
  | { kind: "allow" }
  /** Limite zero e sem tabela para contar: o recurso é do plano, e não tem. */
  | { kind: "block" }
  /** Contar `table` no tenant e comparar com `limit`. */
  | { kind: "count"; table: string; limit: number };

export function resolveLimitCheck(capability: PlanCapability, limits: Limits): LimitCheck {
  const limit = limits[CAPABILITY_LIMIT_KEY[capability]];

  if (limit === undefined || limit === null) return { kind: "allow" };
  // Negativo é a convenção de "sem teto".
  if (limit < 0) return { kind: "allow" };

  const table = CAPABILITY_TABLE[capability];
  if (!table) return limit <= 0 ? { kind: "block" } : { kind: "allow" };

  return { kind: "count", table, limit };
}

export function hasReachedLimit(count: number, limit: number): boolean {
  return count >= limit;
}

/**
 * Teto de quem não tem assinatura: zero em tudo.
 *
 * Aqui morava `FREE_FALLBACK_LIMITS`, que espelhava o plano FREE de produção.
 * Fazia sentido enquanto o FREE existia: sem assinatura, valia o gratuito.
 *
 * A decisão paid-first de 27/08/2026 (`docs/strategy/2026-08-27-pricing-paid-first.md`)
 * tira o FREE do catálogo — e aí esse fallback deixa de ser rede de segurança e
 * vira o problema: apagar o plano do banco **ressuscitaria** o gratuito aqui,
 * em código, com 1 instância de WhatsApp liberada. Instância conectada é
 * exatamente o que o modo demonstração não pode ter (RAM, fila de suporte e
 * risco de ban do número, que destrói o negócio do lojista).
 *
 * Zero em toda chave é o que o paywall espera: `resolveLimitCheck` devolve
 * `block`, ou `count` com teto 0, para todas — e a escrita cai no 402 que a
 * tela de assinatura já sabe tratar. Isto governa ESCRITA: ler o painel
 * continua livre, que é o que sustenta o modo demonstração.
 */
export const BLOCKED_LIMITS: Limits = {
  funnels: 0,
  contacts: 0,
  campaigns: 0,
  uploads_mb: 0,
  team_members: 0,
  whatsapp_instances: 0,
};

/**
 * Decide o teto do tenant a partir do que o banco devolveu.
 *
 * Puro de propósito: `entitlements.ts` importa `server-only` e não roda sob
 * `tsx --test`, então a regra que importa mora aqui.
 *
 * `subscription: null` significa "não existe assinatura" — um FATO, e desde a
 * decisão paid-first vale bloqueio, não plano gratuito. Não confundir com falha
 * de leitura, que é um DESCONHECIDO: adivinhar em caminho de cobrança foi como
 * o defeito do teto ilimitado nasceu. Quem lê o banco trata isso antes de
 * chegar aqui, subindo 500.
 */
export function tenantLimitsFrom(input: {
  subscription: { limits?: Limits | null; extras?: LimitExtras | null } | null;
}): Limits {
  if (!input.subscription) return BLOCKED_LIMITS;

  // Assinatura existe e o plano não põe teto: escolha do catálogo, respeitada.
  // Rebaixar para bloqueio aqui puniria cliente pagante. `{}` só seria perigoso
  // no ramo SEM assinatura — e lá nem se chega a olhar `limits`.
  const base = input.subscription.limits ?? {};
  return somarExtras(base, input.subscription.extras);
}

/**
 * Lê os extras do add-on de `subscriptions.metadata`.
 *
 * Fronteira com o jsonb: nada garante a forma, e a quantity do subscription
 * item do Stripe chega como número ou string dependendo do caminho. Normaliza
 * aqui e devolve `null` para qualquer coisa que não seja quantidade positiva —
 * assim `tenantLimitsFrom` recebe só valor já confiável.
 */
export function extrasFromMetadata(metadata: unknown): LimitExtras | null {
  if (!metadata || typeof metadata !== "object") return null;

  const bruto = (metadata as Record<string, unknown>).extra_whatsapp_instances;
  if (bruto === undefined || bruto === null || bruto === "") return null;

  const valor = typeof bruto === "number" ? bruto : Number(bruto);
  if (!Number.isFinite(valor) || valor <= 0) return null;

  return { whatsapp_instances: Math.floor(valor) };
}

/**
 * Soma os extras da assinatura ao teto do catálogo.
 *
 * A soma é conservadora de propósito: só acontece onde o plano já define um
 * teto FINITO. Chave ausente e valor negativo são as duas formas de dizer
 * "ilimitado" (`resolveLimitCheck` devolve `allow` para as duas) — somar ali
 * trocaria "sem teto" por um número, rebaixando quem paga por causa de uma
 * compra que era pra destravar mais, não menos.
 *
 * Teto zero SOMA: é o caso de comprar o primeiro celular de um plano que não
 * inclui nenhum.
 */
function somarExtras(base: Limits, extras: LimitExtras | null | undefined): Limits {
  if (!extras) return base;

  const resultado: Limits = { ...base };
  for (const chave of Object.keys(extras) as (keyof Limits)[]) {
    const extra = extras[chave];
    // jsonb não tem tipo: o valor pode vir string, negativo ou ausente.
    if (typeof extra !== "number" || !Number.isFinite(extra) || extra <= 0) continue;

    const atual = resultado[chave];
    if (typeof atual !== "number" || atual < 0) continue;

    resultado[chave] = atual + extra;
  }
  return resultado;
}
