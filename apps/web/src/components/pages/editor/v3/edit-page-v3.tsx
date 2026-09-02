"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { LandingPage } from "@/lib/pages/schema";
import type { LpContentV3 } from "@/lib/pages/content-v3";
import { fieldErrorsV3, stateFromPage, toSavePayload, type EditorStateV3 } from "@/lib/pages/editor-v3";
import { createAutosaveCoordinator, type AutosaveCoordinator } from "@/lib/pages/autosave";
import { EditorFormV3 } from "@/components/pages/editor/v3/form-v3";
import { EditorPreviewV3 } from "@/components/pages/editor/v3/preview-v3";

/** Janela do autosave: longa o bastante pra não salvar no meio de uma palavra. */
const AUTOSAVE_MS = 1200;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Edição de página v3 dentro da tela da página: form + prévia, salvando sozinho
 * por PATCH. Não recarrega a página do servidor depois de salvar — recarregar
 * sobrescreveria o que a lojista digitou enquanto a requisição estava no ar.
 * `flushRef` deixa a tela da página esperar o rascunho descer antes de publicar.
 */
export function EditPageV3({
  page,
  content,
  published,
  flushRef,
}: {
  page: LandingPage;
  content: LpContentV3;
  published: boolean;
  flushRef: MutableRefObject<null | (() => Promise<void>)>;
}) {
  const [state, setState] = useState<EditorStateV3>(() => stateFromPage(page, content));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const autosaveRef = useRef<AutosaveCoordinator<EditorStateV3> | null>(null);

  const save = useCallback(
    async (next: EditorStateV3) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/pages/${page.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toSavePayload(next)),
        });
        const data = (await res.json()) as { error?: string; details?: string[] };
        if (!res.ok) {
          setErrors(fieldErrorsV3(data.details));
          throw new Error(data.details?.join(" ") ?? data.error ?? "Não foi possível salvar.");
        }
        setErrors({});
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        throw e;
      }
    },
    [page.id],
  );

  useEffect(() => {
    const coordinator = createAutosaveCoordinator({ delayMs: AUTOSAVE_MS, save });
    autosaveRef.current = coordinator;
    flushRef.current = () => coordinator.flush();
    return () => {
      if (autosaveRef.current === coordinator) autosaveRef.current = null;
      if (flushRef.current) flushRef.current = null;
      coordinator.dispose();
    };
  }, [save, flushRef]);

  const label =
    saveState === "saving"
      ? "Salvando…"
      : saveState === "saved"
        ? published
          ? "Salvo. A página no ar já reflete."
          : "Rascunho salvo."
        : saveState === "error"
          ? "Não salvou. Revise os campos."
          : "Salva sozinho enquanto você edita.";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-volt-950">Conteúdo da página</h2>
        <p className={`text-xs ${saveState === "error" ? "text-alerta" : "text-aco/60"}`} aria-live="polite">{label}</p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
        <EditorFormV3
          state={state}
          onChange={(next) => {
            setState(next);
            autosaveRef.current?.schedule(next);
          }}
          errors={errors}
        />
        <div className="min-w-0 lg:sticky lg:top-6">
          <EditorPreviewV3 content={state.content} />
        </div>
      </div>
    </div>
  );
}
