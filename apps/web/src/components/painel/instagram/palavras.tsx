"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { MAX_KEYWORDS, MAX_KEYWORD_LENGTH } from "@/lib/ig/flow/types";
import { normalizeForMatch } from "@/lib/ig/match-keyword";

export function Palavras({ palavras, aoMudar }: { palavras: string[]; aoMudar: (lista: string[]) => void }) {
  const [digitando, setDigitando] = useState("");
  const cheio = palavras.length >= MAX_KEYWORDS;
  const acrescentar = () => {
    const nova = digitando.trim().slice(0, MAX_KEYWORD_LENGTH);
    if (!nova || cheio) return;
    // Mesma normalização do validador/casador: "Quero" e "quéro" são a mesma palavra.
    const chave = normalizeForMatch(nova);
    if (!palavras.some((p) => normalizeForMatch(p) === chave)) aoMudar([...palavras, nova]);
    setDigitando("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-2 py-1.5 focus-within:border-cobalt-500">
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
        disabled={cheio}
        placeholder={cheio ? `Máximo de ${MAX_KEYWORDS} palavras` : palavras.length ? "" : "adicionar palavra"}
        className="min-w-[8ch] flex-1 bg-transparent text-13 text-volt-950 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 placeholder:text-slate-600"
      />
    </div>
  );
}
