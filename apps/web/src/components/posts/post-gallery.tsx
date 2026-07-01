"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

type Template = {
  id: string;
  label: string;
  category: string;
};

export function PostGallery({ templates }: { templates: Template[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const categories = [...new Set(templates.map((t) => t.category))];

  async function handleDownload(id: string) {
    setDownloading(id);
    try {
      const res = await fetch(`/posts/og?t=${id}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hubflow-post-${id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(null);
    }
  }

  async function handleDownloadAll() {
    for (const t of templates) {
      await handleDownload(t.id);
      // Small delay between downloads to avoid browser blocking
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return (
    <div className="space-y-10">
      {/* Header with download all */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-400">
            {templates.length} posts · 1080×1350px · PNG de alta qualidade
          </p>
        </div>
        <button
          onClick={handleDownloadAll}
          className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white transition hover:bg-iris-claro"
        >
          <Download className="h-4 w-4" />
          Baixar todos
        </button>
      </div>

      {/* Gallery by category */}
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="mb-4 text-lg font-bold text-iris-claro">{cat}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates
              .filter((t) => t.category === cat)
              .map((t) => (
                <div key={t.id} className="group relative">
                  {/* Preview */}
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 transition group-hover:border-iris/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/posts/og?t=${t.id}`}
                      alt={t.label}
                      className="aspect-[4/5] w-full object-cover"
                      loading="lazy"
                    />
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 flex items-center justify-center bg-breu/60 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => handleDownload(t.id)}
                        disabled={downloading === t.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-3 text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro disabled:opacity-50"
                      >
                        {downloading === t.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Baixar PNG
                      </button>
                    </div>
                  </div>
                  {/* Label */}
                  <p className="mt-2 text-center text-xs text-neutral-400">{t.label}</p>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
