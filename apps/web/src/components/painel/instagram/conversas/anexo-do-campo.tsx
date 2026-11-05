"use client";

import React from "react";
import type { EstadoDoAnexo } from "./use-anexo";

const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";

/**
 * A prévia do que vai junto: foto ou vídeo local (blob), ainda sem enviar. O upload não informa progresso por byte,
 * então enquanto sobe a barra é indeterminada. O texto do campo vai junto, opcional.
 */
export function PreviaDoAnexo({ anexo, aoRemover }: { anexo: EstadoDoAnexo; aoRemover: () => void }) {
  if (anexo.fase === "vazio") return null;
  if (anexo.fase === "enviando") {
    return (
      <div role="status" className="flex items-center gap-2 text-13 text-slate-600">
        <progress aria-label={`Enviando ${anexo.nome}`} className="h-2 w-32" />
        Enviando o arquivo…
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 p-2">
      {anexo.tipo === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), não há o que otimizar
        <img src={anexo.previa} alt={`Prévia: ${anexo.nome}`} className="h-24 w-24 rounded-[var(--radius-control)] object-cover" />
      ) : (
        <video src={anexo.previa} controls preload="metadata" aria-label={`Prévia: ${anexo.nome}`} className="h-24 rounded-[var(--radius-control)]" />
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="max-w-full truncate text-13 text-volt-950">{anexo.nome}</span>
        <button type="button" onClick={aoRemover} className={BOTAO}>Remover</button>
      </div>
    </div>
  );
}
