"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { normalizeTag } from "@/lib/ig/flow/names";

/** Etiquetas em chips: o texto digitado vira o formato válido ("Quer Infantil" → "quer-infantil") ao confirmar. */
export function ChipsEtiqueta({ etiquetas, aoMudar, rotulo, max = 20 }: { etiquetas: string[]; aoMudar: (lista: string[]) => void; rotulo: string; max?: number }) {
  const [digitando, setDigitando] = useState("");
  const [recusou, setRecusou] = useState(false);
  const cheio = etiquetas.length >= max;
  const acrescentar = () => {
    if (!digitando.trim() || cheio) return;
    const tag = normalizeTag(digitando);
    setRecusou(tag === null);
    if (tag === null) return;
    if (!etiquetas.includes(tag)) aoMudar([...etiquetas, tag]);
    setDigitando("");
  };
  return (
    <div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-2 py-1.5 focus-within:border-cobalt-500">
        {etiquetas.map((t) => (
          <span key={t} className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-chip)] bg-hover-ficha pl-2 pr-1 text-13 text-volt-950">
            {t}
            <button type="button" aria-label={`Tirar a etiqueta ${t}`} onClick={() => aoMudar(etiquetas.filter((x) => x !== t))} className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-600 hover:text-volt-950">
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-label={rotulo}
          value={digitando}
          disabled={cheio}
          onChange={(e) => {
            setDigitando(e.target.value);
            setRecusou(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              acrescentar();
            }
          }}
          onBlur={acrescentar}
          placeholder={etiquetas.length ? "" : "ex.: quer infantil"}
          className="min-w-[8ch] flex-1 bg-transparent text-13 text-volt-950 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 placeholder:text-slate-600 disabled:opacity-50"
        />
      </div>
      {recusou && <p role="alert" className="mt-1 text-12 text-warning-700">Use letras e números. Espaço vira hífen.</p>}
    </div>
  );
}
