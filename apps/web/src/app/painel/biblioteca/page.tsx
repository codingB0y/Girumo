"use client";

import { useState } from "react";
import { Upload, Image as ImageIcon, Play, Check, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Sent = { name: string; url: string; type: "image" | "video" };

export default function PainelBiblioteca() {
  const [sent, setSent] = useState<Sent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Falha no envio.");
      }
      setSent((s) => [
        { name: file.name, url: URL.createObjectURL(file), type: file.type.startsWith("video") ? "video" : "image" },
        ...s,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Biblioteca</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Seus criativos pra reutilizar nas campanhas
        </p>
      </div>

      {/* Nota honesta */}
      <div className="flex items-center gap-3 rounded-2xl border border-iris/20 bg-iris/[0.05] px-4 py-3.5">
        <Info className="h-5 w-5 shrink-0 text-iris" />
        <p className="text-sm text-aco">
          A galeria completa de criativos chega em breve. Por ora, o que você envia aqui fica
          disponível pra anexar nos disparos das suas campanhas.
        </p>
      </div>

      {/* Upload */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <label
          className={cn(
            "group flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-aco/50 transition",
            busy ? "border-iris/40" : "border-breu/15 hover:border-iris/40 hover:text-iris",
          )}
        >
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bruma transition group-hover:bg-iris/10">
            {busy ? <Loader2 className="h-5 w-5 animate-spin text-iris" /> : <Upload className="h-5 w-5" />}
          </span>
          <span className="text-xs font-medium">{busy ? "Enviando…" : "Arraste ou clique"}</span>
          <span className="font-data text-[10px] text-aco/40">JPG · PNG · MP4</span>
        </label>

        {sent.map((m, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-breu/[0.08] bg-white">
            <div className="relative flex aspect-[4/5] items-center justify-center bg-breu-2">
              {m.type === "video" ? (
                <>
                  <video src={m.url} className="h-full w-full object-cover" />
                  <Play className="absolute h-8 w-8 fill-white text-white" />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
              )}
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-sucesso/90 px-1.5 py-0.5 font-data text-[9px] uppercase tracking-wider text-white">
                <Check className="h-2.5 w-2.5" /> enviado
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2.5">
              {m.type === "video" ? <Play className="h-3.5 w-3.5 text-aco/50" /> : <ImageIcon className="h-3.5 w-3.5 text-aco/50" />}
              <p className="truncate text-xs font-medium text-breu">{m.name}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">{error}</p>}

      {sent.length === 0 && !busy && (
        <p className="text-center text-sm text-aco/55">Nenhum criativo enviado nesta sessão ainda.</p>
      )}
    </div>
  );
}
