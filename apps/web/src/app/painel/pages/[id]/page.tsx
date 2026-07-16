"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { LandingPage, LpStatus } from "@/lib/pages/schema";
import { isLpContentV2 } from "@/lib/pages/render";
import type { LpLeadRow, LpMetrics } from "@/lib/pages/store";
import { EditorForm, type EditorValues } from "@/components/pages/editor/form";

type Detail = { page: LandingPage; metrics: LpMetrics; leads: LpLeadRow[] };

const STATUS: Record<LpStatus, { label: string; pill: string }> = {
  draft: { label: "Rascunho", pill: "bg-bruma text-aco/70" },
  published: { label: "No ar", pill: "bg-sucesso/10 text-sucesso" },
  paused: { label: "Pausada", pill: "bg-atencao/10 text-atencao" },
};

export default function PaginaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [values, setValues] = useState<EditorValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    setValues(
      isLpContentV2(content)
        ? null
        : {
            store_name: content.store_name,
            photo_url: content.photo_url,
            headline: content.headline,
            description: content.description,
            group_topic: content.group_topic,
            primary_color: content.primary_color,
            target_group_url: data.page.target_group_url ?? "",
            campaign_slug: data.page.campaign_slug ?? "",
            meta_pixel_id: data.page.meta_pixel_id ?? "",
            ga4_id: data.page.ga4_id ?? "",
          },
    );
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, okMessage?: string) {
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
        if (okMessage) {
          setCopied(false);
        }
      }
    } catch {
      setError("Sem conexão. Tente de novo.");
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
        <div className="rounded-2xl border border-breu/[0.06] bg-white px-5 py-16 text-center text-sm text-aco/60">
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
        <Link href="/painel/pages" className="inline-flex items-center gap-1.5 text-sm text-aco/60 transition hover:text-breu">
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
            onClick={() => void patch({ status: "published" })}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro disabled:opacity-60"
          >
            <Play className="h-4 w-4" /> Publicar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void patch({ status: "paused" })}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-breu/10 bg-white px-4 py-2.5 text-sm font-medium text-breu transition hover:border-atencao/50 disabled:opacity-60"
          >
            <Pause className="h-4 w-4" /> Pausar
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyLink(page)}
          className="inline-flex items-center gap-2 rounded-xl border border-breu/10 bg-white px-4 py-2.5 text-sm font-medium text-breu transition hover:border-iris/50"
        >
          {copied ? <Check className="h-4 w-4 text-sucesso" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado!" : "Copiar link"}
        </button>
        <a
          href={`/p/${page.slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-breu/10 bg-white px-4 py-2.5 text-sm font-medium text-breu transition hover:border-iris/50"
        >
          <ExternalLink className="h-4 w-4" /> Ver página
        </a>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-alerta/[0.08] px-3 py-2 text-sm text-alerta">
          {error}
        </p>
      ) : null}

      {/* métricas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Eye} label="Visualizações" value={metrics.views.toLocaleString("pt-BR")} />
        <MetricCard icon={UserPlus} label="Leads capturados" value={metrics.leads.toLocaleString("pt-BR")} />
        <MetricCard icon={TrendingUp} label="Conversão" value={`${metrics.conversion.toLocaleString("pt-BR")}%`} />
      </div>

      {/* leads */}
      <div className="rounded-2xl border border-breu/[0.06] bg-white shadow-card">
        <div className="border-b border-breu/[0.06] px-5 py-4">
          <h2 className="font-medium text-breu">Últimos leads</h2>
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
                <tr className="font-data border-b border-breu/[0.06] text-[10px] uppercase tracking-wider text-aco/50">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">WhatsApp</th>
                  <th className="px-5 py-3 font-medium">Origem (UTM)</th>
                  <th className="px-5 py-3 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-breu/[0.04] last:border-0">
                    <td className="px-5 py-3 font-medium text-breu">{l.name ?? "—"}</td>
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

      {/* edição — editor legado; o v2 entra aqui pelo mesmo eixo (schema_version) */}
      {values ? (
        <details className="rounded-2xl border border-breu/[0.06] bg-white shadow-card">
          <summary className="cursor-pointer px-5 py-4 font-medium text-breu">
            Editar conteúdo da página
          </summary>
          <div className="border-t border-breu/[0.06] p-6">
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
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro disabled:opacity-60"
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
    <div className="rounded-2xl border border-breu/[0.06] bg-white p-5 shadow-card">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-aco/50">
        <Icon className="h-4 w-4 text-iris" /> {label}
      </p>
      <p className="font-display mt-2 text-3xl font-extrabold tracking-[-0.02em] text-breu">{value}</p>
    </div>
  );
}
