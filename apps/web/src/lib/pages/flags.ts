/**
 * Flag de rollout do editor v2 (§6).
 *
 * Liga/desliga apenas o EDITOR — ou seja, em qual shape as páginas NOVAS nascem.
 * Não toca no render: página com content v2 continua editorial, página legada
 * continua no BasicTemplate, sempre (decisão travada na Fase 2). Desligar a flag
 * não apaga nem quebra o que já foi publicado; só faz a próxima página nascer no
 * modelo antigo. É esse o rollback: o BasicTemplate nunca saiu do lugar.
 *
 * Nasce DESLIGADA de propósito. Fundir na main não deve, sozinho, mudar o que a
 * lojista vê — a v2 nunca rodou em produção, e a hora de expor isso é uma escolha
 * de quem opera, não um efeito colateral de um merge.
 *
 * Ligar: NEXT_PUBLIC_LP_EDITOR_V2=on (Vercel → Environment Variables → redeploy).
 */
/**
 * Só a string "on" liga. Comparação exata em vez de truthiness porque env var é
 * texto: `Boolean("false")` e `Boolean("0")` são `true`, e um rollback que falha
 * porque alguém escreveu "false" achando que desligava é o pior tipo de bug.
 */
export function parseFlag(value: string | undefined): boolean {
  return value === "on";
}

export function isLpEditorV2Enabled(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_LP_EDITOR_V2);
}

/**
 * Templates v3 (páginas com seções). Mesmo contrato da v2: gate só na CRIAÇÃO —
 * a galeria de modelos aparece com a flag; página já criada em v3 edita e renderiza
 * sem depender dela. Ligar: NEXT_PUBLIC_LP_TEMPLATES_V3=on.
 */
export function isLpTemplatesV3Enabled(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_LP_TEMPLATES_V3);
}

/** Slug do template do modelo único (§3). Páginas novas em v2 nascem com ele. */
export const V2_TEMPLATE_SLUG = "oferta-impacto";
