/**
 * Resolve qual pack de conteúdo v3 usar pelo segmento do tenant (decisão de
 * 30/08/2026, mesmo padrão de `content-packs.ts` pras Mensagens):
 *
 * - `moda_atacado` → `null` (usa o `example` original de `TEMPLATES_V3`,
 *   aprovado pelo Igor — este módulo não reescreve nada lá).
 * - `mercado` → `MERCADO_EXAMPLES`.
 * - demais segmentos e `null`/`undefined` → `NEUTRAL_EXAMPLES`. Tenants
 *   antigos foram backfillados pra `moda_atacado` na migração 20260830233000,
 *   então `null` aqui é CONTA NOVA que ainda não escolheu o ramo — neutro é o
 *   default certo, não regressão.
 */

import type { LpContentV3 } from "./content-v3";
import type { LpTemplateKey } from "./templates-v3";
import { NEUTRAL_EXAMPLES } from "./content-packs-v3-neutral";
import { MERCADO_EXAMPLES } from "./content-packs-v3-mercado";

export function templateExampleForSegment(key: LpTemplateKey, segment: string | null | undefined): LpContentV3 | null {
  if (segment === "moda_atacado") return null;
  if (segment === "mercado") return MERCADO_EXAMPLES[key];
  return NEUTRAL_EXAMPLES[key];
}
