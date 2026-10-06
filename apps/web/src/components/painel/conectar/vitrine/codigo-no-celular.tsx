"use client";

import { useState, type FormEvent } from "react";

const PASSOS_DO_CODIGO = [
  "No WhatsApp, toque em Aparelhos conectados",
  "Toque em Conectar um aparelho",
  "Toque em Conectar com número de telefone",
  "Digite o código abaixo",
];

type Props = {
  /** `ABCD-1234`, já formatado por `codigoDePareamento`. */
  codigo: string | null;
  telefone: string;
  onTelefone: (valor: string) => void;
  carregando: boolean;
  onPedirCodigo: (telefone: string) => void;
};

/**
 * Pareamento por código: a alternativa ao QR para quem conecta pelo próprio
 * celular e não tem como escanear a tela em que está.
 *
 * Sem código, pede o número (o WhatsApp só aceita o código no celular dele).
 * Com código, mostra os passos e o código grande em Mono, na mesma caixinha
 * Canvas do QR.
 */
export function CodigoNoCelular({ codigo, telefone, onTelefone, carregando, onPedirCodigo }: Props) {
  const [tocado, setTocado] = useState(false);
  const vazio = telefone.replace(/\D/g, "").length === 0;

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTocado(true);
    if (vazio) return;
    onPedirCodigo(telefone);
  }

  if (codigo) {
    return (
      <div className="flex w-full flex-col items-center gap-4" data-testid="conectar-codigo-celular">
        <ol className="w-full space-y-2">
          {PASSOS_DO_CODIGO.map((texto, i) => (
            <li key={texto} className="flex items-start gap-3">
              <span className="font-data flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-chip)] bg-canvas-100 text-12 tabular-nums text-volt-950">
                {i + 1}
              </span>
              <span className="text-[14px] text-volt-950">{texto}</span>
            </li>
          ))}
        </ol>
        <div
          className="rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-4"
          role="status"
        >
          {/* O leitor de tela lê caractere por caractere; o visual fica inteiro. */}
          <span className="sr-only">Código de pareamento: {codigo.split("").join(" ")}</span>
          <p
            className="font-data rounded-[var(--radius-chip)] bg-paper-0 px-5 py-4 text-[32px] leading-none tracking-[0.12em] tabular-nums text-volt-950"
            aria-hidden="true"
          >
            {codigo}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={enviar} noValidate>
      <label htmlFor="telefone-pareamento" className="text-[14px] font-medium text-volt-950">
        Número do WhatsApp que vai conectar
      </label>
      <input
        id="telefone-pareamento"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 99999-8888"
        value={telefone}
        onChange={(e) => onTelefone(e.target.value)}
        aria-invalid={tocado && vazio}
        aria-describedby={
          tocado && vazio ? "telefone-pareamento-erro telefone-pareamento-ajuda" : "telefone-pareamento-ajuda"
        }
        className="h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[15px] text-volt-950 placeholder:text-slate-600"
      />
      {tocado && vazio && (
        <p id="telefone-pareamento-erro" role="alert" className="text-13 text-danger-700">
          Digite o número com DDD.
        </p>
      )}
      <p id="telefone-pareamento-ajuda" className="text-12 text-slate-600">
        Com DDD. Número de fora do Brasil: comece com + e o código do país.
      </p>
      <button
        type="submit"
        disabled={carregando}
        className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 hover:brightness-110 disabled:opacity-50"
      >
        {carregando ? "Gerando…" : "Gerar código"}
      </button>
    </form>
  );
}
