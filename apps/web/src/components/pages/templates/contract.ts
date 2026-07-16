import type { LpContentV2 } from "@/lib/pages/content";
import type { AccessiblePalette } from "@/lib/pages/palette";

/**
 * Contrato de props da estrutura editorial v2 (render público). Módulo só-tipos
 * para o `index.ts` e a estrutura compartilharem sem ciclo de import.
 *
 * NÃO existe `targetUrl` aqui de propósito: o destino do grupo nunca chega ao
 * client no HTML da página — ele vem só do `redirect_url` do POST /api/p/lead,
 * após a captura bem-sucedida.
 */
export type StructureProps = {
  slug: string;
  content: LpContentV2;
  palette: AccessiblePalette;
  /** true no preview do editor: desabilita o form e a altura mínima. */
  preview?: boolean;
};
