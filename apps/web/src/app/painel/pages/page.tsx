"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Eye, Loader2, Plus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDuplicatePayload } from "@/lib/pages/duplicate";
import type { LandingPage, LpStatus } from "@/lib/pages/schema";

const STATUS: Record<LpStatus, { label: string; pill: string }> = {
  draft: { label: "Rascunho", pill: "bg-canvas-100 text-aco/70" },
  published: { label: "No ar", pill: "bg-sucesso/10 text-sucesso" },
  paused: { label: "Pausada", pill: "bg-atencao/10 text-atencao" },
};

export default function PagesListPage() {
  const router = useRouter();
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar."))))
      .then((data: LandingPage[]) => setPages(data))
      .catch((e: Error) => setError(e.message));
  }, []);

  /**
   * Duplica a partir do GET de detalhe, não do item da lista: a lista pode vir
   * com um subconjunto de colunas, e copiar de lá perderia campo em silêncio.
   * A cópia nasce rascunho e sem campanha — ver lib/pages/duplicate.ts.
   */
  async function duplicar(id: string) {
    if (duplicando) return;
    setDuplicando(id);
    setError(null);

    try {
      const detalhe = await fetch(`/api/pages/${id}`);
      if (!detalhe.ok) throw new Error("Não consegui ler a página original.");
      const { page } = (await detalhe.json()) as { page: LandingPage };

      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDuplicatePayload(page)),
      });
      const nova = (await res.json()) as LandingPage & { error?: string; details?: string[] };
      if (!res.ok) {
        throw new Error(nova.details?.join(" ") ?? nova.error ?? "Não consegui duplicar.");
      }

      router.push(`/painel/pages/${nova.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui duplicar.");
      setDuplicando(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Páginas</h1>
          <p className="mt-1 text-sm text-aco/70">
            Landing pages de captação que lotam seus grupos — com rastreio de origem.
          </p>
        </div>
        <Link
          href="/painel/pages/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500"
        >
          <Plus className="h-4 w-4" /> Nova página
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-alerta/20 bg-alerta/[0.06] px-5 py-4 text-sm text-alerta">
          {error}
        </div>
      ) : null}

      {pages === null && !error ? (
        <div className="rounded-2xl border border-volt-950/[0.06] bg-white px-5 py-16 text-center text-sm text-aco/60">
          Carregando páginas...
        </div>
      ) : null}

      {pages !== null && pages.length === 0 ? (
        <div className="rounded-2xl border border-volt-950/[0.06] bg-white px-5 py-16 text-center">
          <p className="font-medium text-volt-950">Nenhuma página ainda.</p>
          <p className="mt-1 text-sm text-aco/60">
            Crie a primeira em 2 minutos: escolha um modelo, preencha 7 campos e publique.
          </p>
          <Link
            href="/painel/pages/nova"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500"
          >
            <Plus className="h-4 w-4" /> Criar minha primeira página
          </Link>
        </div>
      ) : null}

      {pages !== null && pages.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-2xl border border-volt-950/[0.06] bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              {/* Link cobre o card inteiro; o botão de duplicar sobe com z-10.
                  Assim o card continua clicável sem aninhar botão dentro de <a>. */}
              <Link
                href={`/painel/pages/${p.id}`}
                aria-label={`Abrir ${p.content.store_name}`}
                className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
              />
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-volt-950">{p.content.store_name}</p>
                <span
                  className={cn(
                    "font-data shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider",
                    STATUS[p.status].pill,
                  )}
                >
                  {STATUS[p.status].label}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-aco/70">{p.content.headline}</p>
              <div className="mt-4 flex items-center gap-4 border-t border-volt-950/[0.06] pt-3 text-xs text-aco/60">
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> {p.views_count} visitas
                </span>
                <span className="flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> {p.leads_count} leads
                </span>
                <span className="font-data ml-auto flex items-center gap-1 text-[11px] text-cobalt-500">
                  /p/{p.slug} <ExternalLink className="h-3 w-3" />
                </span>
              </div>
              <button
                type="button"
                onClick={() => void duplicar(p.id)}
                disabled={duplicando !== null}
                aria-label={`Duplicar ${p.content.store_name}`}
                className="relative z-10 mt-3 inline-flex items-center gap-1.5 rounded-lg border border-volt-950/10 bg-white px-2.5 py-1.5 text-xs font-medium text-volt-950 transition hover:border-cobalt-500/50 disabled:opacity-60"
              >
                {duplicando === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {duplicando === p.id ? "Duplicando..." : "Duplicar"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
