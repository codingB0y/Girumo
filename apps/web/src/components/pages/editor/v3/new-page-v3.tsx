"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { LandingPage, LpTemplate } from "@/lib/pages/schema";
import { fieldErrorsV3, newDraftV3, toSavePayload, type EditorStateV3 } from "@/lib/pages/editor-v3";
import { EditorFormV3 } from "@/components/pages/editor/v3/form-v3";
import { EditorPreviewV3 } from "@/components/pages/editor/v3/preview-v3";
import { TemplateGallery, type GalleryPick } from "@/components/pages/editor/v3/template-gallery";
import { useTenantSegment } from "@/components/painel/use-tenant-segment";

/**
 * Criação v3: galeria de modelos → editor já preenchido pelo template → salvar
 * rascunho → tela da página (publicar lá, depois de revisar). O `template_id`
 * vem da linha do banco com o mesmo slug da chave do template: é o registro do
 * modelo, não decide o render (o render escolhe pelo `schema_version`).
 */
export function NovaPaginaV3() {
  const router = useRouter();
  const segment = useTenantSegment();
  const [templates, setTemplates] = useState<LpTemplate[] | null>(null);
  const [state, setState] = useState<EditorStateV3 | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pages/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar modelos."))))
      .then((data: LpTemplate[]) => setTemplates(data))
      .catch((e: Error) => setError(e.message));
  }, []);

  function choose(key: GalleryPick) {
    setState(newDraftV3(key, undefined, segment));
  }

  async function handleSave() {
    if (!state || saving) return;
    const row = templates?.find((t) => t.slug === state.content.template);
    if (!row) {
      setError("Este modelo ainda não está cadastrado no banco. Avise o suporte.");
      return;
    }
    setError(null);
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: row.id, ...toSavePayload(state) }),
      });
      const data = (await res.json()) as LandingPage & { error?: string; details?: string[] };
      if (!res.ok) {
        // O servidor é a autoridade da validação: cada recusa volta pro campo dela.
        setErrors(fieldErrorsV3(data.details));
        setError(data.details?.length ? "Revise os campos destacados." : (data.error ?? "Não foi possível salvar."));
        setSaving(false);
        return;
      }
      router.push(`/painel/pages/${data.id}`);
    } catch {
      setError("Sem conexão. Tente de novo.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/painel/pages" className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition hover:text-volt-950">
          <ArrowLeft className="h-4 w-4" /> Páginas
        </Link>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.03em]">Nova página</h1>
        <p className="mt-1 text-sm text-aco/70">
          {state ? "A página já vem preenchida. Escreva por cima, ligue e desligue seções, e veja ao vivo." : "Escolha um modelo. Todos já vêm com texto de exemplo do seu ramo."}
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-alerta/[0.08] px-3 py-2 text-sm text-alerta">{error}</p>
      ) : null}

      {!state ? (
        <TemplateGallery onPick={choose} disabled={templates === null && error === null} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <button type="button" onClick={() => { setState(null); setErrors({}); }} className="mb-3 text-xs text-aco/60 hover:text-volt-950">
              ← Trocar de modelo
            </button>
            <EditorFormV3 state={state} onChange={setState} errors={errors} disabled={saving} />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !templates}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cobalt-500 px-4 py-3 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar rascunho"} <ArrowRight className="h-4 w-4" />
            </button>
            <p className="mt-2 text-center text-xs text-aco/50">Você publica na próxima tela, depois de revisar.</p>
          </div>
          <div className="min-w-0 lg:sticky lg:top-6">
            <EditorPreviewV3 content={state.content} />
          </div>
        </div>
      )}
    </div>
  );
}
