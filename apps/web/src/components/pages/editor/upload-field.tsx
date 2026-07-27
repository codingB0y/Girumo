"use client";

/* eslint-disable @next/next/no-img-element */
import { useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { LpMediaRef } from "@/lib/pages/content";
import { mediaSrc } from "@/lib/pages/media";
import { cn } from "@/lib/utils";

/**
 * Envio de imagem do editor (§7.3: a lojista escolhe um arquivo, nunca cola URL).
 * O upload vai pro POST /api/media com o `kind` que autoriza a leitura pública da
 * LP (`lp-media`/`lp-logo`) — mídia de campanha continua privada.
 *
 * O erro vive AQUI dentro, não sobe pro form: se um envio falha, o resto do que a
 * lojista já escreveu continua intacto na tela, e ela só repete o arquivo.
 *
 * `<img>` cru de propósito: é prévia de painel (não é a LP), fora do orçamento de
 * performance da página pública — e evita puxar o otimizador pra dentro do editor.
 */

const LIMITS = {
  "lp-media": { bytes: 10 * 1024 * 1024, label: "10 MB" },
  "lp-logo": { bytes: 5 * 1024 * 1024, label: "5 MB" },
} as const;

export type UploadKind = keyof typeof LIMITS;

export function UploadField({
  label,
  hint,
  kind = "lp-media",
  value,
  onChange,
  altHint = "descreva a imagem pra quem não enxerga",
  aspect = "aspect-[16/10]",
  disabled = false,
}: {
  label: string;
  hint?: string;
  kind?: UploadKind;
  value: LpMediaRef | null;
  onChange: (ref: LpMediaRef | null) => void;
  altHint?: string;
  aspect?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const altId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Envie uma imagem (PNG, JPEG ou WebP).");
      return;
    }
    // Checagem local só pra dar resposta imediata — quem decide é o servidor.
    if (file.size > LIMITS[kind].bytes) {
      setError(`Imagem grande demais (máx ${LIMITS[kind].label}).`);
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Não deu pra enviar. Tente de novo.");
        return;
      }
      onChange({ media_id: data.id, alt: value?.alt ?? "" });
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // reenviar o mesmo arquivo dispara change
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-medium text-volt-950">
        {label}
      </label>
      {hint ? <span className="ml-2 text-xs text-aco/50">{hint}</span> : null}

      <div className="mt-1.5">
        {value ? (
          <div className="space-y-2">
            <div className={cn("relative overflow-hidden rounded-xl bg-canvas-100", aspect)}>
              <img
                src={mediaSrc(value)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={disabled}
                aria-label={`Remover ${label.toLowerCase()}`}
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-aco shadow-sm transition hover:text-alerta"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <label htmlFor={altId} className="block text-xs font-medium text-aco/70">
              Texto alternativo <span className="font-normal text-aco/50">— {altHint}</span>
            </label>
            <input
              id={altId}
              type="text"
              maxLength={120}
              value={value.alt}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
              placeholder="Ex.: arara com peças da coleção nova"
              className="w-full rounded-lg border border-volt-950/15 px-3 py-2 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-volt-950/20 bg-canvas-100/40 text-sm text-aco/60 transition hover:border-cobalt-500/50 hover:text-volt-950 disabled:opacity-60",
              aspect,
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Enviando...
              </>
            ) : (
              <>
                <ImagePlus className="h-5 w-5" aria-hidden />
                Escolher imagem
                <span className="text-xs text-aco/40">até {LIMITS[kind].label}</span>
              </>
            )}
          </button>
        )}

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="sr-only"
        />

        {error ? (
          <p role="alert" className="mt-2 text-xs text-alerta">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
