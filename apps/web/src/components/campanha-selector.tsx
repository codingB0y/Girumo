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
        className="hidden items-center gap-1.5 rounded-full border border-iris/20 bg-iris/10 px-3 py-1.5 text-xs font-medium text-iris-escuro hover:bg-iris/10 sm:inline-flex"
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
        className="flex items-center gap-2 rounded-full border border-breu/10 bg-white px-3 py-1.5 text-xs font-medium text-aco hover:bg-bruma"
      >
        <Layers className="h-3.5 w-3.5 text-iris" />
        <span className="max-w-[160px] truncate">{active ? active.name : "Todas as campanhas"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-aco/50" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-breu/10 bg-white shadow-card">
          <button
            onMouseDown={() => {
              setActiveCampanhaId(null);
              location.reload();
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bruma"
          >
            <span className="text-aco">Todas as campanhas</span>
            {!active && <Check className="h-4 w-4 text-iris" />}
          </button>
          <div className="max-h-64 overflow-y-auto border-t border-bruma">
            {campanhas.map((c) => (
              <button
                key={c.id}
                onMouseDown={() => {
                  setActiveCampanhaId(c.id);
                  location.reload();
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bruma"
              >
                <span className="min-w-0">
                  <span className={cn("block truncate", active?.id === c.id ? "font-medium text-breu" : "text-aco")}>{c.name}</span>
                  <span className="block truncate text-xs text-aco/50">{c.loja} · {c.groupIds.length} grupos</span>
                </span>
                {active?.id === c.id && <Check className="h-4 w-4 shrink-0 text-iris" />}
              </button>
            ))}
          </div>
          <Link href="/campanhas" className="flex items-center gap-1.5 border-t border-bruma px-3 py-2 text-xs font-medium text-iris hover:bg-iris/10">
            <Settings2 className="h-3.5 w-3.5" /> Gerenciar campanhas
          </Link>
        </div>
      )}
    </div>
  );
}
