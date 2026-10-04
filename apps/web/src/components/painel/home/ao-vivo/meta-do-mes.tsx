"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { metaDoTexto } from "@/lib/painel/ao-vivo/meta";

/** Grava a meta de receita do mês; o aviso de erro e o `salvando` ficam aqui, a tela só recebe o valor salvo. */
export function useSalvarMeta(onSalva: (valor: number) => void) {
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);

  /** true = gravou. Texto que não vale não chama o servidor e não avisa: o botão só pede de novo. */
  async function salvar(texto: string): Promise<boolean> {
    const valor = metaDoTexto(texto);
    if (valor === null || salvando) return false;
    setSalvando(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyGoalRevenue: valor }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSalva(valor);
      return true;
    } catch {
      toast("Não foi possível salvar a meta.", "error");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  return { salvando, salvar };
}

type Props = {
  /** Meta atual, para preencher o campo ao editar. */
  meta: number | null;
  salvando: boolean;
  onSalvar: (texto: string) => void;
  onCancelar: () => void;
};

/** Campo da meta dentro da célula "Pedidos anotados hoje": Enter salva, Esc cancela. */
export function EditorDaMeta({ meta, salvando, onSalvar, onCancelar }: Props) {
  const [rascunho, setRascunho] = useState(meta ? String(meta) : "");

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar(rascunho);
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancelar()}
    >
      <label className="sr-only" htmlFor="meta-do-mes-faixa">
        Meta do mês em R$
      </label>
      <input
        id="meta-do-mes-faixa"
        autoFocus
        inputMode="numeric"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        placeholder="50000"
        className="font-data h-9 w-28 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2.5 text-[16px] tabular-nums text-volt-950"
      />
      <button
        type="submit"
        disabled={salvando}
        className="h-9 rounded-[var(--radius-control)] bg-cobalt-500 px-3 text-13 font-semibold text-white disabled:opacity-50"
      >
        {salvando ? "…" : "Salvar"}
      </button>
      <button type="button" onClick={onCancelar} className="h-9 px-1 text-13 font-semibold text-cobalt-500">
        Cancelar
      </button>
    </form>
  );
}
