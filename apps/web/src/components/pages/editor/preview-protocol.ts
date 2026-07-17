import type { EditorValuesV2 } from "@/lib/pages/editor-values";

/**
 * Contrato do postMessage entre o editor e o <iframe> de preview. Fica num módulo
 * só pra que os dois lados compartilhem o mesmo tipo — protocolo combinado por
 * string solta nos dois arquivos é onde essas coisas quebram em silêncio.
 */
export const PREVIEW_MESSAGE = "girumo:lp-preview";

/**
 * Rota do frame. Vive FORA de /painel de propósito: sob o painel ela herdaria o
 * layout (sidebar, topbar, nav mobile) e a prévia mostraria a LP embrulhada no
 * app — dentro do iframe apareciam dois <main>. Continua protegida pelo
 * middleware, que só libera login/signup/api/p/r/p/lp.
 * Constante compartilhada porque três lugares apontam pra cá: o iframe, os
 * banners que se escondem nela e a regra de header do next.config.
 */
export const PREVIEW_PATH = "/editor-preview";

export type PreviewMessage =
  /** editor → frame: o rascunho atual */
  | { type: typeof PREVIEW_MESSAGE; values: EditorValuesV2; ready?: never }
  /** frame → editor: montei, pode mandar o estado */
  | { type: typeof PREVIEW_MESSAGE; ready: true; values?: never };
