"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Video, X, Loader2 } from "lucide-react";
import { uploadMediaFile } from "@/lib/media-upload-client";
import type { TemplateMedia } from "@/lib/template-media";

/** Rótulo curto do anexo — usado no campo e no card da copy. */
export function CopyMediaChip({ media, onRemove }: { media: TemplateMedia; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-canvas-100 px-2.5 py-1.5 text-xs text-aco">
      {media.media_type === "video" ? (
        <Video className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{media.media_name ?? (media.media_type === "video" ? "Vídeo" : "Foto")}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover anexo"
          className="ml-0.5 text-slate-600 hover:text-alerta"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/**
 * Anexo (foto ou vídeo) de uma copy da Biblioteca. Sobe pelo mesmo caminho do
 * compositor (`uploadMediaFile`, direto pro Storage) — o id devolvido é o que
 * a copy guarda e o compositor reusa ao escolher a copy.
 */
export function CopyMediaField({
  value,
  onChange,
}: {
  value: TemplateMedia | null;
  onChange: (media: TemplateMedia | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function pick(accept: string, type: TemplateMedia["media_type"]) {
    const input = fileRef.current;
    if (!input) return;
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      setUploading(true);
      setErro(null);
      try {
        const data = await uploadMediaFile(file);
        onChange({ media_id: data.id, media_type: type, media_name: file.name });
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao enviar arquivo.");
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  const btn =
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-200 px-3 text-[13px] font-medium text-aco transition-colors hover:bg-canvas-100 hover:text-volt-950 disabled:opacity-50";

  return (
    <div className="mt-4">
      <span className="block text-sm font-medium text-volt-950">Anexo (opcional)</span>
      <input ref={fileRef} type="file" className="hidden" aria-hidden="true" />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {value ? (
          <CopyMediaChip media={value} onRemove={() => onChange(null)} />
        ) : (
          <>
            <button type="button" disabled={uploading} onClick={() => pick("image/*", "image")} className={btn}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" /> Foto
            </button>
            <button type="button" disabled={uploading} onClick={() => pick("video/*", "video")} className={btn}>
              <Video className="h-4 w-4" aria-hidden="true" /> Vídeo
            </button>
          </>
        )}
        {uploading && <Loader2 className="h-4 w-4 animate-spin text-cobalt-500" aria-label="Enviando anexo" />}
      </div>
      {erro && <p className="mt-2 text-sm text-alerta">{erro}</p>}
    </div>
  );
}
