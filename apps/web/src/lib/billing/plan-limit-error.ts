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

import type { PlanCapability } from "./capability-limits";

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
/**
 * Tipado por `PlanCapability`, e nao por `string`, de proposito: com
 * `Record<string, ...>` uma capability sem rotulo compilava e so aparecia na
 * tela do cliente, como "Seu plano atual nao inclui RECURSOS". Era o caso de
 * `team_members:invite` (registrado aqui como `members:invite`, que nao existe
 * em lugar nenhum) e de `uploads:create`, que faltava. Agora o compilador
 * cobra a entrada de toda capability nova.
 */
const RECURSO: Record<PlanCapability, { singular: string; plural: string }> = {
  "campaigns:create": { singular: "campanha", plural: "campanhas" },
  "campaigns:send": { singular: "disparo", plural: "disparos" },
  "contacts:reach": { singular: "contato", plural: "contatos" },
  "instances:create": { singular: "número de WhatsApp", plural: "números de WhatsApp" },
  "team_members:invite": { singular: "pessoa na equipe", plural: "pessoas na equipe" },
  "funnels:create": { singular: "página", plural: "páginas" },
  "uploads:create": { singular: "arquivo", plural: "arquivos" },
};

function rotulo(capability: PlanCapability) {
  return RECURSO[capability] ?? { singular: "recurso", plural: "recursos" };
}

/**
 * O plano do cliente não inclui o recurso (teto zero).
 *
 * Este é o caso do FREE com `campaigns: 0`: dizer "limite atingido" seria
 * mentira — ele não criou nenhuma. O que falta é plano, não espaço.
 */
export function planBlockedBody(capability: PlanCapability): PlanLimitBody {
  const { plural } = rotulo(capability);
  return {
    error: `Seu plano atual não inclui ${plural}. Escolha um plano pra liberar.`,
    code: "plan_blocked",
    upgradeUrl: UPGRADE_URL,
  };
}

/**
 * O plano inclui o recurso, mas o teto acabou.
 *
 * A frase evita artigo de propósito. Ela é montada para qualquer recurso, e
 * português tem gênero: não existe artigo que sirva para "pessoa na equipe" e
 * "número de WhatsApp" ao mesmo tempo. O texto anterior produzia "Você já usou
 * a número de WhatsApp do seu plano". Dizer o número junto do recurso resolve
 * sem precisar carregar gênero em cada rótulo.
 */
export function planLimitReachedBody(capability: PlanCapability, limit: number): PlanLimitBody {
  const { singular, plural } = rotulo(capability);
  const recurso = limit === 1 ? singular : plural;
  return {
    error: `Seu plano inclui ${limit} ${recurso}. Mude de plano pra liberar mais.`,
    code: "plan_limit_reached",
    upgradeUrl: UPGRADE_URL,
  };
}

/**
 * O corpo certo a partir do teto que `resolveLimitCheck` devolveu.
 *
 * Existe porque teto zero chega aqui pelo caminho de CONTAGEM, não pelo de
 * bloqueio: `resolveLimitCheck` só responde `block` para capability que não tem
 * tabela para contar. `campaigns:create` tem (`campaign_groups`), então o FREE
 * — que é `campaigns: 0` — cai em `{ kind: "count", limit: 0 }`, a contagem
 * passa de zero e o texto virava "Você já usou as 0 campanhas do seu plano".
 *
 * Ter os dois construtores não bastava: quem decide qual usar é este ponto, e
 * era ele que faltava. Toda decisão de teto zero passa por aqui.
 */
export function planLimitBody(capability: PlanCapability, limit: number): PlanLimitBody {
  return limit === 0 ? planBlockedBody(capability) : planLimitReachedBody(capability, limit);
}

/** Espaço de arquivos do plano esgotado. */
export function planStorageFullBody(uploadsMb: number): PlanLimitBody {
  return {
    error: `Você usou todo o espaço de arquivos do seu plano (${uploadsMb} MB). Mude de plano pra enviar mais.`,
    code: "plan_storage_full",
    upgradeUrl: UPGRADE_URL,
  };
}
