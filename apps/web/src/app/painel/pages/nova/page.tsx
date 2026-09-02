"use client";

import { isLpEditorV2Enabled, isLpTemplatesV3Enabled } from "@/lib/pages/flags";
import { NovaPaginaV2 } from "@/components/pages/editor/new-page-v2";
import { NovaPaginaV3 } from "@/components/pages/editor/v3/new-page-v3";
import { NovaPaginaLegacy } from "@/components/pages/editor/legacy-new-page";

/**
 * Criação de página — só o interruptor do rollout (§6). A flag decide em qual
 * modelo a página NOVA nasce; nada aqui toca no que já está publicado, porque o
 * render escolhe pelo `schema_version` do conteúdo, não por esta tela.
 */
export default function NovaPaginaPage() {
  if (isLpTemplatesV3Enabled()) return <NovaPaginaV3 />;
  return isLpEditorV2Enabled() ? <NovaPaginaV2 /> : <NovaPaginaLegacy />;
}
