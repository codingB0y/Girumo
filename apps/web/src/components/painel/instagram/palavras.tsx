"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_KEYWORDS, MAX_KEYWORD_LENGTH } from "@/lib/ig/flow/types";

export function Palavras({ palavras, aoMudar }: { palavras: string[]; aoMudar: (lista: string[]) => void }) {
  const [digitando, setDigitando] = useState("");
  const acrescentar = () => {
    const nova = digitando.trim().slice(0, MAX_KEYWORD_LENGTH);
    if (!nova || palavras.length >= MAX_KEYWORDS) return;
    aoMudar([...palavras, nova]);
    setDigitando("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-2 py-1.5">
      {palavras.map((p, i) => (
        <span key={`${p}-${i}`} className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-chip)] bg-hover-ficha pl-2 pr-1 text-13 text-volt-950">
          {p}
          <button type="button" aria-label={`Tirar ${p}`} onClick={() => aoMudar(palavras.filter((_, j) => j !== i))} className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-600 hover:text-volt-950">
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        aria-label="Adicionar palavra"
        value={digitando}
        onChange={(e) => setDigitando(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            acrescentar();
          }
        }}
        onBlur={acrescentar}
        placeholder={palavras.length ? "" : "adicionar palavra"}
        className="min-w-[8ch] flex-1 bg-transparent text-13 text-volt-950 outline-none placeholder:text-slate-600"
      />
    </div>
  );
}
