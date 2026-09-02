/**
 * Seleção de estrutura de render da LP pública (Girumo v2).
 *
 * Decisão travada: o eixo de seleção é o `schema_version` do conteúdo, não a
 * coluna `structure` do banco. Conteúdo v2 (`schema_version === 2`) renderiza a
 * estrutura editorial nova; qualquer conteúdo legado continua no BasicTemplate.
 * Isso NÃO depende da migração de colunas estar aplicada e degrada com segurança
 * (páginas antigas seguem exatamente como hoje).
 */

import type { LpContentV2 } from "./content";
import type { LpContentV3 } from "./content-v3";

/** Type guard: o conteúdo publicado está no shape v2 (estrito em schema_version). */
export function isLpContentV2(content: unknown): content is LpContentV2 {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as { schema_version?: unknown }).schema_version === 2
  );
}

/** Type guard: conteúdo v3 (páginas com seções; estrito em schema_version). */
export function isLpContentV3(content: unknown): content is LpContentV3 {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as { schema_version?: unknown }).schema_version === 3
  );
}

export type LpStructureKind = "editorial" | "sections" | "basic";

/** v3 → seções; v2 → estrutura editorial; qualquer outro (legado/ inválido) → basic (fallback). */
export function resolveStructureKind(content: unknown): LpStructureKind {
  if (isLpContentV3(content)) return "sections";
  return isLpContentV2(content) ? "editorial" : "basic";
}
