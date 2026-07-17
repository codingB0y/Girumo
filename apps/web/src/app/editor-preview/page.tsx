"use client";

import { useEffect, useState } from "react";
import { ConversionEditorial } from "@/components/pages/templates/structures/conversion-editorial";
import { derivePalette, type AccessiblePalette } from "@/lib/pages/palette";
import {
  EMPTY_EDITOR_VALUES_V2,
  editorValuesToContentV2,
  type EditorValuesV2,
} from "@/lib/pages/editor-values";
import { PREVIEW_MESSAGE, type PreviewMessage } from "@/components/pages/editor/preview-protocol";

/**
 * Alvo do <iframe> do editor. Existe como ROTA (e não como um <div> dentro do
 * editor) por um motivo concreto: a estrutura editorial decide o layout por
 * breakpoints do Tailwind, que respondem ao VIEWPORT — dentro de um div de 390px
 * numa tela grande, o `lg:` continuaria valendo e o preview mobile seria mentira.
 * Um iframe tem viewport próprio, então o que aparece aqui é o que a cliente vê.
 *
 * Recebe o rascunho por postMessage (mesma origem) a cada tecla, sem salvar nada:
 * o autosave é assunto da tela de edição, não do preview.
 */

const FALLBACK_PALETTE: AccessiblePalette = {
  brand: "#6d2436",
  accent: "#6d2436",
  onBrand: "#ffffff",
  adjusted: false,
  reason: null,
};

/** Retângulo neutro enquanto a lojista não enviou a foto (o preview nasce vazio). */
const PLACEHOLDER_PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='550'%3E%3Crect width='800' height='550' fill='%23e7dfd2'/%3E%3Ctext x='400' y='283' text-anchor='middle' font-family='sans-serif' font-size='20' fill='%23a89e8f'%3ESua foto aparece aqui%3C/text%3E%3C/svg%3E";

/**
 * Preenche o que ainda está vazio pra a página nunca aparecer quebrada enquanto
 * se edita — placeholder é assunto do preview, não do content (o que vai pro
 * banco continua sendo exatamente o que a lojista escreveu).
 */
function withPlaceholders(values: EditorValuesV2): EditorValuesV2 {
  return {
    ...values,
    store_name: values.store_name || "Sua loja",
    headline: values.headline || "Sua headline aparece aqui",
    description: values.description || "Sua descrição aparece aqui, em uma ou duas frases.",
    hero: values.hero?.media_id ? values.hero : { url: PLACEHOLDER_PHOTO, alt: "" },
  };
}

export default function EditorPreviewFrame() {
  const [values, setValues] = useState<EditorValuesV2>(EMPTY_EDITOR_VALUES_V2);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Só aceita o editor da própria origem — a página vive sob /painel (com
      // sessão), então nada de terceiro pode injetar conteúdo aqui.
      if (event.origin !== window.location.origin) return;
      const data = event.data as PreviewMessage | undefined;
      // O próprio "pronto" que mandamos pro pai volta aqui em alguns browsers —
      // só interessa a mensagem que traz rascunho.
      if (data?.type !== PREVIEW_MESSAGE || !data.values) return;
      setValues(data.values);
    }

    window.addEventListener("message", onMessage);
    // Avisa o editor que o frame está pronto (ele reenvia o estado atual).
    window.parent?.postMessage({ type: PREVIEW_MESSAGE, ready: true }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const content = editorValuesToContentV2(withPlaceholders(values));
  const palette = derivePalette(content.brand_color) ?? FALLBACK_PALETTE;

  return <ConversionEditorial slug="preview" content={content} palette={palette} preview />;
}
