"use client";

import { useMemo } from "react";
import type { EditorValuesV2 } from "@/lib/pages/editor-values";
import { PREVIEW_MESSAGE, type PreviewMessage } from "@/components/pages/editor/preview-protocol";
import { PreviewFrame } from "@/components/pages/editor/preview-frame";

/** Preview ao vivo do editor v2: a casca é a mesma da v3, só a mensagem muda. */
export function EditorPreviewV2({ values }: { values: EditorValuesV2 }) {
  const message = useMemo<PreviewMessage>(() => ({ type: PREVIEW_MESSAGE, values }), [values]);
  return <PreviewFrame message={message} />;
}
