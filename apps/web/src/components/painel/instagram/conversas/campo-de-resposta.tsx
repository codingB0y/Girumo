"use client";

import React, { useRef, useState } from "react";
import { NOTA_DA_PAUSA, quando, type EstadoDoCampo } from "@/lib/ig/conversas/tela";
import { cn } from "@/lib/utils";
import type { Resultado } from "./use-fio";

const LIMITE = 1000;
const BOTAO = "inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";

type Props = {
  estado: EstadoDoCampo;
  /** "@ana" — vai no rótulo do campo. */
  quem: string;
  aoEnviar: (texto: string) => Promise<Resultado>;
  aoRetomar: () => Promise<Resultado>;
};

/** O campo de resposta com os quatro estados do mockup: janela aberta, 24 h a 7 dias, fechada e robô pausado. */
export function CampoDeResposta({ estado, quem, aoEnviar, aoRetomar }: Props) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const agora = new Date();
  const vazio = texto.trim() === "";

  const enviar = async () => {
    if (vazio || !estado.podeEnviar || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await aoEnviar(texto.trim());
    setEnviando(false);
    if (r.ok) {
      setTexto("");
      // O foco volta ao campo para a loja seguir digitando sem pegar o mouse.
      campo.current?.focus();
    } else {
      setErro(r.mensagem);
    }
  };

  const retomar = async () => {
    const r = await aoRetomar();
    if (!r.ok) setErro(r.mensagem);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line-200 bg-paper-0 p-3">
      {estado.pausadoAte && (
        <div className="flex flex-col gap-1 rounded-[var(--radius-control)] bg-canvas-100 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-13 font-medium text-volt-950">Robô pausado até {quando(estado.pausadoAte, agora)}</span>
            <button type="button" onClick={() => void retomar()} className={BOTAO}>Retomar agora</button>
          </div>
          <p className="text-12 text-slate-600">{NOTA_DA_PAUSA}</p>
        </div>
      )}
      <p className={cn("flex items-center gap-2 text-13 font-medium", estado.modo === "aberta" ? "text-success-700" : estado.modo === "humano" ? "text-warning-700" : "text-slate-600")}>
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
        {estado.faixa}
      </p>
      <label>
        <span className="sr-only">Responder {quem}</span>
        <textarea
          ref={campo}
          rows={3}
          value={estado.podeEnviar ? texto : ""}
          disabled={!estado.podeEnviar}
          maxLength={LIMITE}
          placeholder={estado.podeEnviar ? "Escreva a resposta" : "Fechada pelo Instagram"}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void enviar();
            }
          }}
          className="w-full resize-none rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:bg-canvas-100"
        />
      </label>
      {erro && <p role="alert" className="text-13 text-danger-700">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-12 text-slate-600">
          {estado.nota}
          {estado.podeEnviar && " Ao responder, o robô pausa aqui por 12 h."}
        </p>
        <span className="flex items-center gap-2">
          {estado.podeEnviar && <span className="font-data text-12 tabular-nums text-slate-600">{texto.length}/{LIMITE}</span>}
          <button type="button" onClick={() => void enviar()} disabled={vazio || !estado.podeEnviar || enviando} className={cn(BOTAO, "border-cobalt-500 bg-cobalt-500 text-paper-0")}>
            {enviando ? "Enviando…" : estado.rotuloEnviar}
          </button>
        </span>
      </div>
    </div>
  );
}
