/**
 * O corpo do 402 que o gate de plano devolve.
 *
 * Mora aqui, e não em `entitlements.ts`, porque aquele arquivo tem
 * "server-only" e por isso não roda sob `tsx --test` — mesmo motivo pelo qual
 * `plan-codes.ts` foi extraído de `plans.ts`.
 *
 * O defeito que isto corrige: o gate devolvia `new Response("texto", { status:
 * 402 })`, que sai com `content-type: text/plain`. Toda tela do painel lê a
 * resposta de erro com `res.json().catch(() => ({}))` e depois `body?.error ??
 * "Erro ao criar."` — então o parse falhava, o corpo virava `{}` e o cliente
 * lia **"Erro ao criar."**. A mensagem do plano nunca chegava na tela: quem
 * batia no limite via algo indistinguível de bug do sistema, sem nenhuma pista
 * de que era assinatura e sem caminho para resolver.
 *
 * `code` existe para a tela poder DECIDIR (mostrar botão de assinar) sem casar
 * string de mensagem, que muda com copy.
 */

export type PlanLimitCode =
  /** O plano não inclui o recurso — teto zero. Não adianta apagar nada. */
  | "plan_blocked"
  /** O plano inclui, mas o teto já foi usado. Apagar algo libera. */
  | "plan_limit_reached"
  /** Espaço de upload do plano esgotado. */
  | "plan_storage_full";

export type PlanLimitBody = {
  error: string;
  code: PlanLimitCode;
  /** Para onde mandar o cliente. A tela usa direto num link. */
  upgradeUrl: string;
};

export const UPGRADE_URL = "/painel/configuracoes";

/**
 * Rótulos na voz do lojista, não no vocabulário do banco.
 *
 * "campanhas:create" é nome de capability; o cliente pensa em "campanha".
 */
const RECURSO: Record<string, { singular: string; plural: string }> = {
  "campaigns:create": { singular: "campanha", plural: "campanhas" },
  "campaigns:send": { singular: "disparo", plural: "disparos" },
  "contacts:create": { singular: "contato", plural: "contatos" },
  "instances:create": { singular: "número de WhatsApp", plural: "números de WhatsApp" },
  "members:invite": { singular: "pessoa na equipe", plural: "pessoas na equipe" },
  "funnels:create": { singular: "página", plural: "páginas" },
};

function rotulo(capability: string) {
  return RECURSO[capability] ?? { singular: "recurso", plural: "recursos" };
}

/**
 * O plano do cliente não inclui o recurso (teto zero).
 *
 * Este é o caso do FREE com `campaigns: 0`: dizer "limite atingido" seria
 * mentira — ele não criou nenhuma. O que falta é plano, não espaço.
 */
export function planBlockedBody(capability: string): PlanLimitBody {
  const { plural } = rotulo(capability);
  return {
    error: `Seu plano atual não inclui ${plural}. Escolha um plano pra liberar.`,
    code: "plan_blocked",
    upgradeUrl: UPGRADE_URL,
  };
}

/** O plano inclui o recurso, mas o teto acabou. */
export function planLimitReachedBody(capability: string, limit: number): PlanLimitBody {
  const { singular, plural } = rotulo(capability);
  const quantas = limit === 1 ? `a ${singular}` : `as ${limit} ${plural}`;
  return {
    error: `Você já usou ${quantas} do seu plano. Mude de plano pra continuar.`,
    code: "plan_limit_reached",
    upgradeUrl: UPGRADE_URL,
  };
}

/** Espaço de arquivos do plano esgotado. */
export function planStorageFullBody(uploadsMb: number): PlanLimitBody {
  return {
    error: `Você usou todo o espaço de arquivos do seu plano (${uploadsMb} MB). Mude de plano pra enviar mais.`,
    code: "plan_storage_full",
    upgradeUrl: UPGRADE_URL,
  };
}
