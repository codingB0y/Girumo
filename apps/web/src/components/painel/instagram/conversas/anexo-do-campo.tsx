"use client";

import React from "react";
import type { EstadoDoAnexo } from "./use-anexo";

const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";

/**
 * A prévia do que vai junto: foto ou vídeo local (blob), ainda sem enviar. O upload não informa progresso por byte,
 * então enquanto sobe a barra é indeterminada. O texto do campo vai junto, opcional. A região de status fica sempre
 * montada (leitor de tela só anuncia mudança em região que já existia) e só o texto dela muda.
 */
export function PreviaDoAnexo({ anexo, aoRemover, bloqueado = false }: { anexo: EstadoDoAnexo; aoRemover: () => void; bloqueado?: boolean }) {
  const aviso = anexo.fase === "enviando" ? "Enviando o arquivo…" : anexo.fase === "pronto" ? "Arquivo pronto para enviar." : "";
  return (
    <div>
      <p role="status" className={anexo.fase === "vazio" ? "sr-only" : "text-13 text-slate-600"}>{aviso}</p>
      {anexo.fase === "enviando" && <progress aria-label={`Enviando ${anexo.nome}`} className="mt-1 h-2 w-32" />}
      {anexo.fase === "pronto" && (
        <div className="mt-1 flex items-start gap-3 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 p-2">
          {anexo.tipo === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), não há o que otimizar
            <img src={anexo.previa} alt={`Prévia: ${anexo.nome}`} className="h-24 w-24 rounded-[var(--radius-control)] object-cover" />
          ) : (
            <video src={anexo.previa} controls preload="metadata" aria-label={`Prévia: ${anexo.nome}`} className="h-24 rounded-[var(--radius-control)]" />
          )}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="max-w-full truncate text-13 text-volt-950">{anexo.nome}</span>
            <button type="button" onClick={aoRemover} disabled={bloqueado} className={BOTAO}>Remover</button>
          </div>
        </div>
      )}
    </div>
  );
}
