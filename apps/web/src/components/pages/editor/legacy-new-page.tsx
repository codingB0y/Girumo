"use client";

/**
 * Tela de criação LEGADA — alvo do rollback da flag (§6).
 *
 * É o código que estava no ar antes do editor v2, extraído do git SEM reescrita:
 * se a flag desligar, a lojista volta exatamente pro que funcionava, não pra uma
 * reconstrução de memória do que funcionava. Por isso o estilo aqui é o antigo
 * (slate, seleção de 3 modelos) e não deve ser "melhorado" — modificar o alvo do
 * rollback é anular o rollback.
 *
 * Sai de cena junto com o BasicTemplate, quando o v2 estiver assentado.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingPage, LpTemplate } from "@/lib/pages/schema";
import { EditorForm, EMPTY_EDITOR_VALUES, type EditorValues } from "@/components/pages/editor/form";
import { EditorPreview } from "@/components/pages/editor/preview";

export function NovaPaginaLegacy() {
  const router = useRouter();
  const [templates, setTemplates] = useState<LpTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [values, setValues] = useState<EditorValues>(EMPTY_EDITOR_VALUES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pages/templates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar modelos."))))
      .then((data: LpTemplate[]) => {
        setTemplates(data);
        if (data.length > 0) setTemplateId(data[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  async function handleSave() {
    if (!templateId || saving) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          content: {
            store_name: values.store_name,
            photo_url: values.photo_url,
            headline: values.headline,
            description: values.description,
            group_topic: values.group_topic,
            primary_color: values.primary_color,
          },
          target_group_url: values.target_group_url || null,
          campaign_slug: values.campaign_slug || null,
          meta_pixel_id: values.meta_pixel_id || null,
          ga4_id: values.ga4_id || null,
        }),
      });
      const data = (await res.json()) as LandingPage & { error?: string; details?: string[] };
      if (!res.ok) {
        setError(data.details?.join(" ") ?? data.error ?? "Não foi possível salvar.");
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
        <Link href="/painel/pages" className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition hover:text-breu">
          <ArrowLeft className="h-4 w-4" /> Páginas
        </Link>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.03em]">Nova página</h1>
        <p className="mt-1 text-sm text-aco/70">
          Escolha o modelo, preencha os campos e veja o resultado ao vivo. Publica em 2 minutos.
        </p>
      </div>

      {/* seleção de modelo */}
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Modelo da página">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={templateId === t.id}
            onClick={() => setTemplateId(t.id)}
            className={cn(
              "rounded-2xl border bg-white p-4 text-left transition",
              templateId === t.id
                ? "border-iris shadow-iris"
                : "border-breu/[0.08] hover:border-iris/40",
            )}
          >
            <p className="font-medium text-breu">{t.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-aco/60">
              {t.default_copy.headline ?? ""}
            </p>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* form */}
        <div className="rounded-2xl border border-breu/[0.06] bg-white p-6 shadow-card">
          <EditorForm values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />

          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-alerta/[0.08] px-3 py-2 text-sm text-alerta">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !templateId}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-iris px-4 py-3 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar rascunho"} <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-2 text-center text-xs text-aco/50">
            Você publica na próxima tela, depois de revisar.
          </p>
        </div>

        {/* preview ao vivo */}
        <div className="lg:sticky lg:top-6">
          <EditorPreview values={values} copy={selected?.default_copy ?? {}} />
        </div>
      </div>
    </div>
  );
}
