"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticatedFetch } from "@/lib/supabase/client";

type MessageTemplate = { id: string; folder_id: string; name: string; body: string };
type Folder = { id: string; name: string; templates: MessageTemplate[] };

/**
 * Biblioteca de copies dentro do compositor.
 *
 * A biblioteca existia só como página própria (`/painel/biblioteca`), alcançável
 * por um link solto na lista de campanhas — ou seja, longe do único lugar onde
 * ela serve pra algo: a hora de escrever a mensagem. Aqui ela entra como picker.
 *
 * Lê as MESMAS pastas/copies da aba Biblioteca (`/api/library`) — nada de lista
 * própria divergente. Buscado uma vez, na 1ª abertura.
 */
export function CopyPicker({ onPick, className }: { onPick: (body: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [folderId, setFolderId] = useState<string | "all">("all");

  useEffect(() => {
    if (!open || folders !== null) return;
    authenticatedFetch("/api/library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Folder[]) => setFolders(data))
      .catch(() => setFolders([]));
  }, [open, folders]);

  const copies = useMemo(() => {
    const all = (folders ?? []).flatMap((f) => f.templates);
    return folderId === "all" ? all : (folders ?? []).find((f) => f.id === folderId)?.templates ?? [];
  }, [folders, folderId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors duration-[160ms] hover:bg-poco hover:text-volt-950",
          className,
        )}
      >
        <BookOpen className="h-4 w-4" strokeWidth={1.75} /> Biblioteca
      </button>
    );
  }

  return (
    <div className={cn("rounded-xl border border-line-200 bg-poco p-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">
          Escolha um modelo — ele entra no campo e você ajusta
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar biblioteca"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors duration-[160ms] hover:bg-papel hover:text-volt-950"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {folders === null ? (
        <p className="mt-2.5 text-[13px] text-slate-600">Carregando…</p>
      ) : (
        <>
          <div className="mt-2.5 flex flex-wrap gap-1">
            <CategoriaBtn active={folderId === "all"} onClick={() => setFolderId("all")} label="Todas" />
            {folders.map((f) => (
              <CategoriaBtn key={f.id} active={folderId === f.id} onClick={() => setFolderId(f.id)} label={f.name} />
            ))}
          </div>

          <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto">
            {copies.length === 0 && <p className="px-1 py-2 text-[13px] text-slate-600">Nenhuma copy aqui ainda.</p>}
            {copies.map((copy) => (
              <button
                key={copy.id}
                type="button"
                onClick={() => {
                  onPick(copy.body);
                  setOpen(false);
                }}
                className="block w-full rounded-lg border border-line-200 bg-papel px-3 py-2.5 text-left transition-colors duration-[160ms] hover:border-cobalt-500 hover:bg-canvas-100"
              >
                <span className="block text-sm font-medium text-volt-950">{copy.name}</span>
                <span className="mt-0.5 block line-clamp-2 text-[13px] leading-relaxed text-slate-600">
                  {copy.body}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CategoriaBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors duration-[160ms]",
        active ? "bg-volt-950 text-white" : "text-slate-600 hover:text-volt-950",
      )}
    >
      {label}
    </button>
  );
}
