"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Pause,
  Play,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { pageSummary, type LandingPage, type LpStatus } from "@/lib/pages/schema";
import { isLpContentV2, isLpContentV3 } from "@/lib/pages/render";
import type { LpLeadRow, LpMetrics } from "@/lib/pages/store";
import { EditorForm, type EditorValues } from "@/components/pages/editor/form";
import { ShareKit } from "@/components/pages/share-kit";
import { EditorFormV2 } from "@/components/pages/editor/form-v2";
import { EditorPreviewV2 } from "@/components/pages/editor/preview-v2";
import {
  contentV2ToEditorValues,
  editorValuesToContentV2,
  errorField,
  type EditorValuesV2,
} from "@/lib/pages/editor-values";
import {
  createAutosaveCoordinator,
  type AutosaveCoordinator,
} from "@/lib/pages/autosave";

type Detail = { page: LandingPage; metrics: LpMetrics; leads: LpLeadRow[] };

/** Janela do autosave: longa o bastante pra não salvar no meio de uma palavra. */
const AUTOSAVE_MS = 1200;

/** Cobalt do modelo legado: página v1 não tem `brand_color` no content. */
const LEGACY_BRAND_HEX = "#7c3aed";

type SaveState = "idle" | "saving" | "saved" | "error";

const STATUS: Record<LpStatus, { label: string; pill: string }> = {
  draft: { label: "Rascunho", pill: "bg-canvas-100 text-aco/70" },
  published: { label: "No ar", pill: "bg-sucesso/10 text-sucesso" },
  paused: { label: "Pausada", pill: "bg-atencao/10 text-atencao" },
};

export default function PaginaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [values, setValues] = useState<EditorValues | null>(null);
  const [valuesV2, setValuesV2] = useState<EditorValuesV2 | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const autosaveRef = useRef<AutosaveCoordinator<EditorValuesV2> | null>(null);
  const latestValuesV2Ref = useRef<EditorValuesV2 | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pages/${id}`);
    if (!res.ok) {
      setError("Página não encontrada.");
      return;
    }
    const data = (await res.json()) as Detail;
    setDetail(data);

    // Editor dual: conteúdo v2 tem editor próprio; página legada segue no editor
    // antigo até a migração (Fase 5). O eixo é o mesmo do render (schema_version).
    const content = data.page.content;
    const outsideContent = {
      target_group_url: data.page.target_group_url ?? "",
      campaign_slug: data.page.campaign_slug ?? "",
      meta_pixel_id: data.page.meta_pixel_id ?? "",
      ga4_id: data.page.ga4_id ?? "",
    };

    if (isLpContentV2(content)) {
      const loadedValues = { ...contentV2ToEditorValues(content), ...outsideContent };
      latestValuesV2Ref.current = loadedValues;
      setValuesV2(loadedValues);
      return;
    }
    latestValuesV2Ref.current = null;
    // v3 (seções) é editado pelo componente próprio, que carrega o content da página.
    if (isLpContentV3(content)) return;
    setValues({
      store_name: content.store_name,
      photo_url: content.photo_url,
      headline: content.headline,
      description: content.description,
      group_topic: content.group_topic,
      primary_color: content.primary_color,
      ...outsideContent,
    });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Autosave do editor v2: PATCH sozinho depois que a lojista para de digitar.
   * Não recarrega a página do servidor depois de salvar — recarregar sobrescreveria
   * o que ela digitou enquanto a requisição estava no ar.
   */
  const saveV2 = useCallback(
    async (next: EditorValuesV2) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/pages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: editorValuesToContentV2(next),
            target_group_url: next.target_group_url || null,
            campaign_slug: next.campaign_slug || null,
            meta_pixel_id: next.meta_pixel_id || null,
            ga4_id: next.ga4_id || null,
          }),
        });
        const data = (await res.json()) as { error?: string; details?: string[] };
        if (!res.ok) {
          setFieldErrors(Object.fromEntries((data.details ?? []).map((d) => [errorField(d), d])));
          throw new Error(
            data.details?.join(" ") ?? data.error ?? "Não foi possível salvar.",
          );
        }
        setFieldErrors({});
        setSaveState("saved");
      } catch (saveError) {
        setSaveState("error");
        throw saveError;
      }
    },
    [id],
  );

  useEffect(() => {
    const coordinator = createAutosaveCoordinator({
      delayMs: AUTOSAVE_MS,
      save: saveV2,
    });
    autosaveRef.current = coordinator;
    return () => {
      if (autosaveRef.current === coordinator) autosaveRef.current = null;
      coordinator.dispose();
    };
  }, [saveV2]);

  async function patch(body: Record<string, unknown>) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; details?: string[] };
      if (!res.ok) {
        setError(data.details?.join(" ") ?? data.error ?? "Não foi possível salvar.");
      } else {
        await load();
      }
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function requestStatus(status: LpStatus): Promise<LandingPage> {
    const res = await fetch(`/api/pages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = (await res.json()) as LandingPage & {
      error?: string;
      details?: string[];
    };
    if (!res.ok) {
      throw new Error(
        data.details?.join(" ") ?? data.error ?? "Não foi possível atualizar o status.",
      );
    }
    return data;
  }

  async function changeStatus(status: LpStatus) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const coordinator = autosaveRef.current;
      const updated = coordinator
        ? await coordinator.runAfterFlush(() => requestStatus(status))
        : await requestStatus(status);
      // Atualiza somente o snapshot remoto da página. Os valores do editor são
      // locais e não podem ser substituídos por uma resposta/load mais antiga.
      setDetail((current) => (current ? { ...current, page: updated } : current));
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Não foi possível atualizar o status.",
      );
    } finally {
      setBusy(false);
    }
  }

  function publicUrl(page: LandingPage): string {
    return `${window.location.origin}/p/${page.slug}`;
  }

  async function copyLink(page: LandingPage) {
    await navigator.clipboard.writeText(publicUrl(page));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-volt-950/[0.06] bg-white px-5 py-16 text-center text-sm text-aco/60">
          {error ?? "Carregando..."}
        </div>
      </div>
    );
  }

  const { page, metrics, leads } = detail;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* header */}
      <div>
        <Link href="/painel/pages" className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition hover:text-volt-950">
          <ArrowLeft className="h-4 w-4" /> Páginas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">
            {page.content.store_name}
          </h1>
          <span className={cn("font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", STATUS[page.status].pill)}>
            {STATUS[page.status].label}
          </span>
        </div>
        <p className="font-data mt-1 text-sm text-aco/60">/p/{page.slug}</p>
      </div>

      {/* ações */}
      <div className="flex flex-wrap items-center gap-2">
        {page.status !== "published" ? (
          <button
            type="button"
            onClick={() => void changeStatus("published")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500 disabled:opacity-60"
          >
            <Play className="h-4 w-4" /> Publicar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void changeStatus("paused")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-4 py-2.5 text-sm font-medium text-volt-950 transition hover:border-atencao/50 disabled:opacity-60"
          >
            <Pause className="h-4 w-4" /> Pausar
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyLink(page)}
          className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-4 py-2.5 text-sm font-medium text-volt-950 transition hover:border-cobalt-500/50"
        >
          {copied ? <Check className="h-4 w-4 text-sucesso" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado!" : "Copiar link"}
        </button>
        <a
          href={`/p/${page.slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-4 py-2.5 text-sm font-medium text-volt-950 transition hover:border-cobalt-500/50"
        >
          <ExternalLink className="h-4 w-4" /> Ver página
        </a>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-alerta/[0.08] px-3 py-2 text-sm text-alerta">
          {error}
        </p>
      ) : null}

      {/* kit de divulgação */}
      <ShareKit
        slug={page.slug}
        storeName={page.content.store_name}
        headline={pageSummary(page.content).headline}
        brandColor={
          isLpContentV2(page.content) || isLpContentV3(page.content)
            ? page.content.brand_color
            : LEGACY_BRAND_HEX
        }
        published={page.status === "published"}
      />

      {/* métricas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Eye} label="Visualizações" value={metrics.views.toLocaleString("pt-BR")} />
        <MetricCard icon={UserPlus} label="Leads capturados" value={metrics.leads.toLocaleString("pt-BR")} />
        <MetricCard icon={TrendingUp} label="Conversão" value={`${metrics.conversion.toLocaleString("pt-BR")}%`} />
      </div>

      {/* leads */}
      <div className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-card">
        <div className="border-b border-volt-950/[0.06] px-5 py-4">
          <h2 className="font-medium text-volt-950">Últimos leads</h2>
          <p className="text-xs text-aco/60">Os 20 mais recentes, com a origem de cada um.</p>
        </div>
        {leads.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-aco/60">
            Nenhum lead ainda. Compartilhe o link da página pra começar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="font-data border-b border-volt-950/[0.06] text-[10px] uppercase tracking-wider text-aco/50">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">WhatsApp</th>
                  <th className="px-5 py-3 font-medium">Origem (UTM)</th>
                  <th className="px-5 py-3 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-volt-950/[0.04] last:border-0">
                    <td className="px-5 py-3 font-medium text-volt-950">{l.name ?? "—"}</td>
                    <td className="font-data px-5 py-3 text-aco">{l.whatsapp ?? "—"}</td>
                    <td className="px-5 py-3">
                      {l.utm_source || l.utm_medium || l.utm_campaign ? (
                        <span className="font-data inline-flex flex-wrap gap-1 text-[11px] text-aco/70">
                          {[l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(" · ")}
                        </span>
                      ) : (
                        <span className="text-xs text-aco/40">direto</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-aco/60">
                      {new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* edição v2: form + prévia ao vivo, salvando sozinho */}
      {valuesV2 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium text-volt-950">Conteúdo da página</h2>
            <SaveStatus state={saveState} published={page.status === "published"} />
          </div>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
            <EditorFormV2
              values={valuesV2}
              onChange={(patch) => {
                const current = latestValuesV2Ref.current;
                if (!current) return;
                const next = { ...current, ...patch };
                latestValuesV2Ref.current = next;
                autosaveRef.current?.schedule(next);
                setValuesV2(next);
              }}
              errors={fieldErrors}
            />
            <div className="min-w-0 lg:sticky lg:top-6">
              <EditorPreviewV2 values={valuesV2} />
            </div>
          </div>
        </div>
      ) : null}

      {/* edição legada — páginas anteriores ao v2, até a migração */}
      {values ? (
        <details className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-card">
          <summary className="cursor-pointer px-5 py-4 font-medium text-volt-950">
            Editar conteúdo da página
          </summary>
          <div className="border-t border-volt-950/[0.06] p-6">
            <EditorForm
              values={values}
              onChange={(p) => setValues((v) => (v ? { ...v, ...p } : v))}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() =>
                void patch({
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
                })
              }
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500 disabled:opacity-60"
            >
              {busy ? "Salvando..." : "Salvar alterações"}
            </button>
            {page.status === "published" ? (
              <p className="mt-2 text-xs text-aco/50">A página no ar atualiza em segundos.</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Estado do autosave. `aria-live="polite"` porque a lojista não fica olhando pro
 * canto da tela: quem usa leitor precisa saber que salvou sem perder o foco do
 * campo. "Salvo" some do jeito que apareceu — o que importa é o erro.
 */
function SaveStatus({ state, published }: { state: SaveState; published: boolean }) {
  const text: Record<SaveState, string | null> = {
    idle: published ? "A página no ar atualiza em segundos." : "As mudanças salvam sozinhas.",
    saving: "Salvando...",
    saved: published ? "Salvo — a página no ar já mostra." : "Salvo.",
    error: "Não deu pra salvar. Revise os campos destacados.",
  };

  return (
    <p
      aria-live="polite"
      className={cn("text-xs", state === "error" ? "text-alerta" : "text-aco/50")}
    >
      {text[state]}
    </p>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-volt-950/[0.06] bg-white p-5 shadow-card">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-aco/50">
        <Icon className="h-4 w-4 text-cobalt-500" /> {label}
      </p>
      <p className="font-display mt-2 text-3xl font-extrabold tracking-[-0.02em] text-volt-950">{value}</p>
    </div>
  );
}
