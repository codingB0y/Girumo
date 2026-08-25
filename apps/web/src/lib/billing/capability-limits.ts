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
  | "contacts:create"
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

export const CAPABILITY_LIMIT_KEY: Record<PlanCapability, keyof Limits> = {
  "instances:create": "whatsapp_instances",
  "contacts:create": "contacts",
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
 */
export const CAPABILITY_TABLE: Partial<Record<PlanCapability, string>> = {
  "instances:create": "instances",
  "contacts:create": "contacts",
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
 * Teto aplicado quando o tenant nao tem assinatura E o catalogo nao pode ser
 * lido. Espelha o plano FREE de producao (25/08/2026).
 *
 * Existe porque catalogo indisponivel nao pode virar barra livre: era assim que
 * o defeito se manifestava — `{}` faz `resolveLimitCheck` responder `allow`
 * para tudo, entao quem nao pagava ficava com teto MAIOR que qualquer cliente.
 * Se os numeros do FREE mudarem no banco, este fallback fica conservador de
 * proposito: e a ultima linha, nao a fonte da verdade.
 */
export const FREE_FALLBACK_LIMITS: Limits = {
  funnels: 1,
  contacts: 250,
  campaigns: 0,
  uploads_mb: 100,
  team_members: 1,
  whatsapp_instances: 1,
};

/**
 * Decide o teto do tenant a partir do que o banco devolveu.
 *
 * Puro de proposito: `entitlements.ts` importa `server-only` e nao roda sob
 * `tsx --test`, entao a regra que importa mora aqui.
 *
 * `assinatura: null` significa "nao existe assinatura" — um FATO, que vira o
 * teto do FREE. Nao confundir com falha de leitura, que e um DESCONHECIDO e
 * nao deve ser adivinhado: quem le o banco trata isso antes de chegar aqui.
 */
export function limitesDoTenant(input: {
  assinatura: { limits?: Limits | null } | null;
  planoFree: Limits | null;
}): Limits {
  if (!input.assinatura) return input.planoFree ?? FREE_FALLBACK_LIMITS;

  // Assinatura existe e o plano nao poe teto: escolha do catalogo, respeitada.
  // Rebaixar para FREE aqui puniria cliente pagante.
  return input.assinatura.limits ?? {};
}
