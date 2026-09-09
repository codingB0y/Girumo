"use client";

import { useMemo, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LIBRARY_CATEGORIES, type LibraryCategory } from "@/lib/library-copies";
import { libraryCopiesForSegment } from "@/lib/content-packs";
import { useTenantSegment } from "@/components/painel/use-tenant-segment";

/**
 * Biblioteca de copies dentro do compositor.
 *
 * A biblioteca existia só como página própria (`/painel/biblioteca`), alcançável
 * por um link solto na lista de campanhas — ou seja, longe do único lugar onde
 * ela serve pra algo: a hora de escrever a mensagem. Aqui ela entra como picker.
 */
export function CopyPicker({ onPick, className }: { onPick: (body: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<LibraryCategory | "all">("all");

  // O picker é transiente: enquanto o ramo do tenant carrega, mostra o pack
  // neutro em vez de travar o compositor.
  const segment = useTenantSegment();
  const copies = useMemo(() => {
    const base = libraryCopiesForSegment(segment ?? null);
    return category === "all" ? base : base.filter((c) => c.category === category);
  }, [category, segment]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-aco/70 transition-colors duration-[160ms] hover:bg-poco hover:text-volt-950",
          className,
        )}
      >
        <BookOpen className="h-4 w-4" strokeWidth={1.75} /> Biblioteca
      </button>
    );
  }

  return (
    <div className={cn("rounded-xl border border-volt-950/10 bg-poco p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/55">
          Escolha um modelo — ele entra no campo e você ajusta
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar biblioteca"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-aco/60 transition-colors duration-[160ms] hover:bg-papel hover:text-volt-950"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1">
        <CategoriaBtn active={category === "all"} onClick={() => setCategory("all")} label="Todas" />
        {LIBRARY_CATEGORIES.map((c) => (
          <CategoriaBtn
            key={c.id}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
            label={c.label}
            title={c.hint}
          />
        ))}
      </div>

      <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto">
        {copies.map((copy) => (
          <button
            key={copy.id}
            type="button"
            onClick={() => {
              onPick(copy.body);
              setOpen(false);
            }}
            className="block w-full rounded-lg border border-volt-950/[0.06] bg-papel px-3 py-2.5 text-left transition-colors duration-[160ms] hover:border-cobalt-500/40 hover:bg-cobalt-500/[0.04]"
          >
            <span className="block text-sm font-medium text-volt-950">{copy.title}</span>
            <span className="mt-0.5 block line-clamp-2 text-[13px] leading-relaxed text-aco/70">{copy.body}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoriaBtn({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "cursor-pointer rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors duration-[160ms]",
        active ? "bg-volt-950 text-white" : "text-aco/70 hover:text-volt-950",
      )}
    >
      {label}
    </button>
  );
}
