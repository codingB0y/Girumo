"use client";

import { useMemo } from "react";
import type { LpContentV3 } from "@/lib/pages/content-v3";
import { PREVIEW_MESSAGE, type PreviewMessage } from "@/components/pages/editor/preview-protocol";
import { PreviewFrame } from "@/components/pages/editor/preview-frame";

/** Preview ao vivo do editor v3: manda o content inteiro a cada mudança. */
export function EditorPreviewV3({ content }: { content: LpContentV3 }) {
  const message = useMemo<PreviewMessage>(() => ({ type: PREVIEW_MESSAGE, content }), [content]);
  return <PreviewFrame message={message} />;
}
