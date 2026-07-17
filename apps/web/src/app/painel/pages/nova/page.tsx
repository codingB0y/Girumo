"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { LandingPage, LpTemplate } from "@/lib/pages/schema";
import {
  EMPTY_EDITOR_VALUES_V2,
  editorValuesToContentV2,
  errorField,
  type EditorValuesV2,
} from "@/lib/pages/editor-values";
import { EditorFormV2 } from "@/components/pages/editor/form-v2";
import { EditorPreviewV2 } from "@/components/pages/editor/preview-v2";

/**
 * Criação de página. Toda página nova nasce em v2 (estrutura editorial única do
 * §3) — por isso a escolha de modelo saiu da tela: não há mais o que escolher, e
 * a lojista responde só sobre CONTEÚDO. O template continua sendo gravado porque
 * a coluna existe e serve as páginas legadas; aqui ele é só o registro do modelo.
 */
export default function NovaPaginaPage() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [values, setValues] = useState<EditorValuesV2>(EMPTY_EDITOR_VALUES_V2);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pages/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar modelos."))))
      .then((data: LpTemplate[]) => setTemplateId(data[0]?.id ?? null))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function handleSave() {
    if (!templateId || saving) return;
    setError(null);
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          content: editorValuesToContentV2(values),
          target_group_url: values.target_group_url || null,
          campaign_slug: values.campaign_slug || null,
          meta_pixel_id: values.meta_pixel_id || null,
          ga4_id: values.ga4_id || null,
        }),
      });
      const data = (await res.json()) as LandingPage & { error?: string; details?: string[] };
      if (!res.ok) {
        // O servidor é a autoridade da validação: cada recusa volta pro campo dela.
        setErrors(Object.fromEntries((data.details ?? []).map((d) => [errorField(d), d])));
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
        <Link
          href="/painel/pages"
          className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition hover:text-breu"
        >
          <ArrowLeft className="h-4 w-4" /> Páginas
        </Link>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.03em]">Nova página</h1>
        <p className="mt-1 text-sm text-aco/70">
          Preencha os campos e veja o resultado ao vivo. Publica em 2 minutos.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <EditorFormV2
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
            errors={errors}
            disabled={saving}
          />

          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-alerta/[0.08] px-3 py-2 text-sm text-alerta">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !templateId}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-iris px-4 py-3 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar rascunho"} <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-2 text-center text-xs text-aco/50">
            Você publica na próxima tela, depois de revisar.
          </p>
        </div>

        <div className="lg:sticky lg:top-6">
          <EditorPreviewV2 values={values} />
        </div>
      </div>
    </div>
  );
}
