import type { EditorValuesV2 } from "@/lib/pages/editor-values";

/**
 * Contrato do postMessage entre o editor e o <iframe> de preview. Fica num módulo
 * só pra que os dois lados compartilhem o mesmo tipo — protocolo combinado por
 * string solta nos dois arquivos é onde essas coisas quebram em silêncio.
 */
export const PREVIEW_MESSAGE = "girumo:lp-preview";

export type PreviewMessage =
  /** editor → frame: o rascunho atual */
  | { type: typeof PREVIEW_MESSAGE; values: EditorValuesV2; ready?: never }
  /** frame → editor: montei, pode mandar o estado */
  | { type: typeof PREVIEW_MESSAGE; ready: true; values?: never };
