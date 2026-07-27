/**
 * Captura e funil (Girumo LP v2 — §5). Peças PURAS do lado servidor: vivem fora
 * de `analytics.ts` porque aquele módulo é `server-only` (hash de IP, rate-limit)
 * e não pode ser importado pelo runner de testes. Aqui não há I/O — só as regras
 * que decidem o que conta como uma captura e o que conta como um evento.
 */

export type LpDevice = "mobile" | "tablet" | "desktop";

const TABLET_RE = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i;
const MOBILE_RE = /iphone|ipod|android|blackberry|iemobile|opera mini|windows phone|mobile/i;

/**
 * Dimensão `device` da captura. Tablet é testado ANTES de mobile: um Android
 * tablet manda "Android" sem "Mobile", e um iPad manda "iPad" junto de sinais
 * que casariam com mobile — a ordem inversa classificaria os dois como celular.
 */
export function deviceFromUserAgent(ua: string | null): LpDevice | null {
  if (!ua || !ua.trim()) return null;
  if (TABLET_RE.test(ua)) return "tablet";
  if (MOBILE_RE.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Janela de idempotência da captura. A unique do banco é
 * (landing_page_id, published_version, contact_id, idem_key) — o contato já está
 * na chave, então isto aqui só precisa definir de quanto em quanto tempo a mesma
 * pessoa pode ser capturada de novo na mesma versão da página.
 *
 * Um dia (UTC): reenviar o form, dar dois cliques ou recarregar a página não
 * cria captura nova nem infla a métrica (§5), mas uma volta legítima semanas
 * depois — outra campanha, outro contexto — ainda é registrada.
 *
 * Derivado no servidor de propósito: chave vinda do client seria só um pedido
 * educado para não duplicar.
 */
export function captureIdemKey(now: Date = new Date()): string {
  return `day:${now.toISOString().slice(0, 10)}`;
}

/** Funil de 5 eventos (§5). A ordem é a do funil, não alfabética. */
export const CANONICAL_EVENTS = [
  "page_view",
  "form_start",
  "lead_submit_attempt",
  "lead_created",
  "group_click",
] as const;

export type LpCanonicalEvent = (typeof CANONICAL_EVENTS)[number];

export function isCanonicalEvent(name: string): name is LpCanonicalEvent {
  return (CANONICAL_EVENTS as readonly string[]).includes(name);
}

/**
 * Nome legado equivalente, quando existe. As páginas do Flow Pages v1 gravaram
 * PageView/Lead/GroupJoin; renomear os eventos sem back-map zeraria o histórico
 * delas no painel. `form_start` e `lead_submit_attempt` não têm par — são novos.
 */
const LEGACY_ALIAS: Partial<Record<LpCanonicalEvent, string>> = {
  page_view: "PageView",
  lead_created: "Lead",
  group_click: "GroupJoin",
};

export function legacyAliasFor(event: LpCanonicalEvent): string | null {
  return LEGACY_ALIAS[event] ?? null;
}
