"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, ChevronDown, Check, Settings2 } from "lucide-react";
import { useCampanhas } from "@/lib/use-campanhas";
import { setActiveCampanhaId } from "@/lib/active-campanha";
import { cn } from "@/lib/utils";

export function CampanhaSelector() {
  const { campanhas, active, loaded } = useCampanhas();
  const [open, setOpen] = useState(false);

  if (loaded && campanhas.length === 0) {
    return (
      <Link
        href="/campanhas"
        className="hidden items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 sm:inline-flex"
      >
        <Layers className="h-3.5 w-3.5" /> Criar campanha
      </Link>
    );
  }

  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <Layers className="h-3.5 w-3.5 text-brand-500" />
        <span className="max-w-[160px] truncate">{active ? active.name : "Todas as campanhas"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <button
            onMouseDown={() => {
              setActiveCampanhaId(null);
              location.reload();
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <span className="text-slate-600">Todas as campanhas</span>
            {!active && <Check className="h-4 w-4 text-brand-600" />}
          </button>
          <div className="max-h-64 overflow-y-auto border-t border-slate-100">
            {campanhas.map((c) => (
              <button
                key={c.id}
                onMouseDown={() => {
                  setActiveCampanhaId(c.id);
                  location.reload();
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className={cn("block truncate", active?.id === c.id ? "font-medium text-slate-900" : "text-slate-700")}>{c.name}</span>
                  <span className="block truncate text-xs text-slate-400">{c.loja} · {c.groupIds.length} grupos</span>
                </span>
                {active?.id === c.id && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            ))}
          </div>
          <Link href="/campanhas" className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50">
            <Settings2 className="h-3.5 w-3.5" /> Gerenciar campanhas
          </Link>
        </div>
      )}
    </div>
  );
}
