"use client";

import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIBRARY_CATEGORIES, LIBRARY_COPIES, type LibraryCategory } from "@/lib/library-copies";

// Biblioteca incorporada dentro de Campanhas (sem item próprio na sidebar).
export default function PainelBiblioteca() {
  const [active, setActive] = useState<LibraryCategory | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copies = useMemo(
    () => (active === "all" ? LIBRARY_COPIES : LIBRARY_COPIES.filter((c) => c.category === active)),
    [active],
  );

  async function handleCopy(id: string, body: string) {
    try {
      await navigator.clipboard?.writeText(body);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      // clipboard indisponível — sem feedback, sem quebrar a tela
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header>
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">Biblioteca</h1>
        <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
          Modelos prontos pra copiar e postar nos seus grupos.
        </p>
      </header>

      {/* Filtro de categorias */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActive("all")}
          className={cn(
            "font-data rounded-full px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-[160ms]",
            active === "all" ? "bg-cobalt-500 text-white" : "bg-poco text-aco hover:text-volt-950",
          )}
        >
          Todas
        </button>
        {LIBRARY_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActive(cat.id)}
            title={cat.hint}
            className={cn(
              "font-data rounded-full px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-[160ms]",
              active === cat.id ? "bg-cobalt-500 text-white" : "bg-poco text-aco hover:text-volt-950",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Cards de copy */}
      {copies.length === 0 ? (
        <div className="pn-card rounded-2xl px-5 py-16 text-center">
          <p className="font-editorial text-[22px] italic text-volt-950">Nenhuma copy nessa categoria ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {copies.map((copy) => {
            const copied = copiedId === copy.id;
            return (
              <div key={copy.id} className="pn-card flex flex-col rounded-2xl p-5">
                <p className="font-medium text-volt-950">{copy.title}</p>
                <p className="mt-2 flex-1 whitespace-pre-line text-sm leading-relaxed text-aco">{copy.body}</p>
                <button
                  onClick={() => handleCopy(copy.id, copy.body)}
                  className={cn(
                    "font-data mt-4 inline-flex w-fit items-center gap-1.5 rounded-xl px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors duration-[160ms]",
                    copied ? "bg-sucesso/10 text-sucesso" : "bg-poco text-aco hover:text-volt-950",
                  )}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
