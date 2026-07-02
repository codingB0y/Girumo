"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Eye, Plus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingPage, LpStatus } from "@/lib/pages/schema";

const STATUS: Record<LpStatus, { label: string; pill: string }> = {
  draft: { label: "Rascunho", pill: "bg-bruma text-aco/70" },
  published: { label: "No ar", pill: "bg-sucesso/10 text-sucesso" },
  paused: { label: "Pausada", pill: "bg-atencao/10 text-atencao" },
};

export default function PagesListPage() {
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pages")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Falha ao carregar."))))
      .then((data: LandingPage[]) => setPages(data))
      .catch((e: Error) => setError(e.message));
  }, []);

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
          className="inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro"
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
        <div className="rounded-2xl border border-breu/[0.06] bg-white px-5 py-16 text-center text-sm text-aco/60">
          Carregando páginas...
        </div>
      ) : null}

      {pages !== null && pages.length === 0 ? (
        <div className="rounded-2xl border border-breu/[0.06] bg-white px-5 py-16 text-center">
          <p className="font-medium text-breu">Nenhuma página ainda.</p>
          <p className="mt-1 text-sm text-aco/60">
            Crie a primeira em 2 minutos: escolha um modelo, preencha 7 campos e publique.
          </p>
          <Link
            href="/painel/pages/nova"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro"
          >
            <Plus className="h-4 w-4" /> Criar minha primeira página
          </Link>
        </div>
      ) : null}

      {pages !== null && pages.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <Link
              key={p.id}
              href={`/painel/pages/${p.id}`}
              className="group rounded-2xl border border-breu/[0.06] bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-breu">{p.content.store_name}</p>
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
              <div className="mt-4 flex items-center gap-4 border-t border-breu/[0.06] pt-3 text-xs text-aco/60">
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> {p.views_count} visitas
                </span>
                <span className="flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5" /> {p.leads_count} leads
                </span>
                <span className="font-data ml-auto flex items-center gap-1 text-[11px] text-iris">
                  /p/{p.slug} <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
