"use client";

import { useMemo, useState } from "react";
import { Upload, Play, Image as ImageIcon, Search, Send, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Collection = "Ofertas" | "Lançamentos" | "Catálogo" | "Vídeos";
type Media = {
  name: string;
  collection: Collection;
  type: "image" | "video";
  headline?: string;
  grad: string;
  used: number;
};

const MEDIA: Media[] = [
  { name: "Oferta −30% Inverno", collection: "Ofertas", type: "image", headline: "−30% HOJE", grad: "linear-gradient(135deg,#3D1FB0,#6A4BF0)", used: 4 },
  { name: "Lançamento Lote 12", collection: "Lançamentos", type: "image", headline: "LOTE 12 CHEGOU", grad: "linear-gradient(135deg,#11142A,#3D1FB0)", used: 2 },
  { name: "Catálogo Verão", collection: "Catálogo", type: "image", headline: "NOVO CATÁLOGO", grad: "linear-gradient(135deg,#6A4BF0,#8A6CFF)", used: 6 },
  { name: "Reels Bastidores", collection: "Vídeos", type: "video", grad: "linear-gradient(135deg,#0B0D1A,#3A3F5C)", used: 1 },
  { name: "Promo Relâmpago", collection: "Ofertas", type: "image", headline: "SÓ HOJE", grad: "linear-gradient(135deg,#3D1FB0,#A78CFF)", used: 3 },
  { name: "Boas-vindas VIP", collection: "Lançamentos", type: "image", headline: "BEM-VINDA", grad: "linear-gradient(135deg,#11142A,#6A4BF0)", used: 5 },
  { name: "Catálogo Atacado", collection: "Catálogo", type: "image", headline: "ATACADO", grad: "linear-gradient(135deg,#6A4BF0,#3D1FB0)", used: 2 },
  { name: "Vídeo Unboxing", collection: "Vídeos", type: "video", grad: "linear-gradient(135deg,#0B0D1A,#11142A)", used: 0 },
  { name: "Black Friday Teaser", collection: "Ofertas", type: "image", headline: "BLACK FRIDAY", grad: "linear-gradient(135deg,#0B0D1A,#6A4BF0)", used: 0 },
];

const TABS = ["Tudo", "Ofertas", "Lançamentos", "Catálogo", "Vídeos"] as const;
type Tab = (typeof TABS)[number];

export default function PainelBiblioteca() {
  const [tab, setTab] = useState<Tab>("Tudo");
  const [q, setQ] = useState("");

  const items = useMemo(
    () =>
      MEDIA.filter(
        (m) =>
          (tab === "Tudo" || m.collection === tab) &&
          m.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [tab, q],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Biblioteca</h1>
          <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
            Seus criativos prontos pra reutilizar
          </p>
        </div>
        <button className="group inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro">
          <Upload className="h-4 w-4" /> Enviar criativo
        </button>
      </div>

      {/* Filtros + busca */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-breu/10 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-medium transition",
                tab === t ? "bg-breu text-white" : "text-aco/70 hover:text-breu",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar criativo…"
            className="w-full rounded-xl border border-breu/10 bg-white py-2.5 pl-9 pr-3 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10 sm:w-60"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {/* Dropzone */}
        <button className="group flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-breu/15 text-aco/50 transition hover:border-iris/40 hover:text-iris">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bruma transition group-hover:bg-iris/10">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-xs font-medium">Arraste ou clique</span>
          <span className="font-data text-[10px] text-aco/40">JPG · PNG · MP4</span>
        </button>

        {items.map((m) => (
          <div
            key={m.name}
            className="group overflow-hidden rounded-2xl border border-breu/[0.08] bg-white"
          >
            {/* Thumbnail */}
            <div
              className="relative flex aspect-[4/5] flex-col justify-between p-3 text-white"
              style={{ background: m.grad }}
            >
              <div className="flex items-center justify-between">
                <span className="font-data inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wider backdrop-blur">
                  {m.type === "video" ? <Play className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                  {m.type === "video" ? "Vídeo" : "Imagem"}
                </span>
              </div>
              {m.headline && (
                <p className="font-display text-lg font-extrabold leading-tight tracking-tight drop-shadow">
                  {m.headline}
                </p>
              )}
              {m.type === "video" && (
                <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                  <Play className="h-5 w-5 fill-white" />
                </span>
              )}
              {/* Overlay hover */}
              <div className="absolute inset-0 flex items-end justify-center bg-breu/60 p-3 opacity-0 backdrop-blur-[2px] transition group-hover:opacity-100">
                <button className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-medium text-breu transition hover:bg-iris hover:text-white">
                  <Send className="h-3.5 w-3.5" /> Usar em campanha
                </button>
              </div>
            </div>
            {/* Meta */}
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-breu">{m.name}</p>
                <p className="font-data text-[10px] text-aco/50">
                  {m.used > 0 ? `usado em ${m.used} campanha${m.used > 1 ? "s" : ""}` : "nunca usado"}
                </p>
              </div>
              <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-aco/40 transition hover:bg-bruma hover:text-breu">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
