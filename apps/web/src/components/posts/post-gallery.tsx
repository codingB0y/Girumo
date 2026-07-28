"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  DEFAULT_POST_FORMAT,
  POST_FORMATS,
  type PostFormatKey,
} from "@/app/posts/post-formats";

type Template = {
  id: string;
  label: string;
  category: string;
};

const FORMAT_OPTIONS: ReadonlyArray<{ key: PostFormatKey; label: string; dimensions: string }> = [
  { key: "square", label: "Quadrado", dimensions: "1080×1080" },
  { key: "portrait", label: "Retrato", dimensions: "1080×1350" },
  { key: "story", label: "Story", dimensions: "1080×1920" },
  { key: "videoCover", label: "Capa de vídeo", dimensions: "1920×1080" },
];

function postUrl(id: string, format: PostFormatKey) {
  const query = new URLSearchParams({ t: id, format });
  return `/posts/og?${query.toString()}`;
}

export function PostGallery({ templates }: { templates: Template[] }) {
  const [format, setFormat] = useState<PostFormatKey>(DEFAULT_POST_FORMAT);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dimensions = POST_FORMATS[format];
  const categories = [...new Set(templates.map((template) => template.category))];

  async function handleDownload(id: string) {
    let objectUrl: string | null = null;
    setDownloading(id);
    setError(null);

    try {
      const res = await fetch(postUrl(id, format));
      if (!res.ok) throw new Error(`Não foi possível gerar a imagem (${res.status}).`);

      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `girumo-post-${id}-${format}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      console.error("Falha ao baixar post Girumo:", cause);
      setError(cause instanceof Error ? cause.message : "Não foi possível baixar a imagem.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setDownloading(null);
    }
  }

  async function handleDownloadAll() {
    setBulkDownloading(true);
    setError(null);
    try {
      for (const template of templates) {
        await handleDownload(template.id);
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    } finally {
      setBulkDownloading(false);
    }
  }

  return (
    <div className="space-y-12">
      <section className="border border-line-200 bg-paper-0 p-5 sm:p-6" aria-labelledby="post-format-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="post-format-heading" className="font-tech text-lg font-bold text-volt-950">
              Formato de saída
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              A prévia e todos os downloads usam o formato selecionado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher formato do post">
            {FORMAT_OPTIONS.map((option) => {
              const selected = option.key === format;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFormat(option.key)}
                  className={`min-h-10 border px-3.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-700 ${
                    selected
                      ? "border-acid-500 bg-acid-500 text-volt-950"
                      : "border-line-200 bg-paper-0 text-volt-950 hover:border-cobalt-500"
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="font-data block text-[10px] text-slate-600">{option.dimensions}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4 border-b border-line-200 pb-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-data text-xs uppercase tracking-[0.12em] text-slate-600">
          {templates.length} peças · {dimensions.width}×{dimensions.height} · PNG
        </p>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={bulkDownloading || downloading !== null}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-acid-500 px-5 py-2.5 text-sm font-semibold text-volt-950 transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-700 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          {bulkDownloading ? "Preparando arquivos" : "Baixar todos"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="border border-danger-700 bg-paper-0 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      ) : null}

      {categories.map((category) => (
        <section key={category} aria-labelledby={`category-${category.replace(/\W+/g, "-").toLowerCase()}`}>
          <div className="mb-5 flex items-center gap-4">
            <h2
              id={`category-${category.replace(/\W+/g, "-").toLowerCase()}`}
              className="font-tech text-xl font-bold tracking-tight text-volt-950"
            >
              {category}
            </h2>
            <div className="h-px flex-1 bg-line-200" aria-hidden />
          </div>
          <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates
              .filter((template) => template.category === category)
              .map((template) => (
                <article key={template.id} className="border border-line-200 bg-paper-0 p-3">
                  <div
                    className="overflow-hidden bg-volt-950"
                    style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={postUrl(template.id, format)}
                      alt={`Prévia: ${template.label}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-volt-950">{template.label}</p>
                      <p className="font-data mt-0.5 text-[10px] uppercase tracking-[0.1em] text-slate-600">{format}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(template.id)}
                      disabled={downloading === template.id || bulkDownloading}
                      aria-label={`Baixar ${template.label} em ${format}`}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-volt-950 bg-volt-950 text-paper-0 transition-colors hover:bg-volt-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-700 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {downloading === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
