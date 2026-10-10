"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { brl } from "@/components/painel/home/format";
import {
  LINHA_VAZIA,
  MAX_ITENS,
  MAX_NOME_DO_PRODUTO,
  pecasDasLinhas,
  rotuloDePecas,
  subtotalDaLinha,
  totalDasLinhas,
  validarLinhas,
  type LinhaDaVenda,
} from "@/lib/painel/vendas";
import { cn } from "@/lib/utils";
import type { ItemDeVenda } from "@/lib/vendas/tipos";

/** id do `<datalist>` com os nomes já usados no mês; a página o renderiza uma vez. */
export const LISTA_DE_PRODUTOS = "vendas-produtos";

/** 16px no campo: abaixo disso o iOS dá zoom ao focar (spec §4). */
export const CLASSE_DO_CAMPO =
  "h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950 placeholder:text-slate-600";
export const CLASSE_DO_ROTULO = "mb-1 block text-13 font-semibold text-volt-950";

/** Chave estável: com o índice, remover a 2ª de 3 linhas levaria foco e texto em composição para a linha errada. */
type LinhaNaTela = LinhaDaVenda & { chave: number };

type Props = {
  /** Prefixo dos ids: o registro e cada correção têm o seu, senão dois "Nome do produto" dividem o mesmo id. */
  idBase: string;
  titulo: string;
  linhasIniciais: readonly LinhaDaVenda[];
  /** "Registrar venda" → botão "Registrar venda · R$ 289,70". */
  verbo: string;
  /** Devolve a mensagem de erro, ou null quando deu certo. */
  aoEnviar: (itens: ItemDeVenda[]) => Promise<string | null>;
};

/**
 * Produtos da venda (spec §4, mockup "Registrar venda"): nome com `<datalist>`,
 * quantidade, valor unitário, subtotal e remover por linha; "Adicionar produto";
 * total ao vivo e o envio com o total no rótulo. Valida com as mesmas regras da
 * API antes de enviar e desabilita o botão enquanto salva (clique duplo não
 * duplica a venda — spec §6, mesmo padrão do `RegistroDePedido`).
 */
export function FormularioDeItens({ idBase, titulo, linhasIniciais, verbo, aoEnviar }: Props) {
  const proxima = useRef(linhasIniciais.length);
  const [linhas, setLinhas] = useState<LinhaNaTela[]>(() => linhasIniciais.map((linha, i) => ({ ...linha, chave: i })));
  const [focar, setFocar] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const total = totalDasLinhas(linhas);
  const idTitulo = `${idBase}-titulo`;

  function mudar(chave: number, campo: keyof LinhaDaVenda, valor: string) {
    setLinhas((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, [campo]: valor } : linha)));
    setErro("");
  }

  function adicionar() {
    const chave = proxima.current;
    proxima.current += 1;
    setLinhas((atuais) => [...atuais, { ...LINHA_VAZIA, chave }]);
    setFocar(chave);
  }

  function remover(chave: number) {
    setLinhas((atuais) => atuais.filter((linha) => linha.chave !== chave));
  }

  async function enviar() {
    if (enviando) return;
    const validacao = validarLinhas(linhas);
    if (!validacao.ok) {
      setErro(validacao.erro);
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const falha = await aoEnviar(validacao.itens);
      if (falha) setErro(falha);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      aria-labelledby={idTitulo}
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
      className="flex flex-col gap-3.5 rounded-xl border border-line-200 bg-paper-0 p-4"
    >
      <h2 id={idTitulo} className="font-brand text-15 font-bold text-volt-950">
        {titulo}
      </h2>

      {linhas.map((linha, i) => {
        const id = `${idBase}-${linha.chave}`;
        return (
          <fieldset key={linha.chave} className="flex flex-col gap-2 border-b border-line-200 pb-3.5">
            <legend className="font-data mb-1.5 text-12 text-slate-600">Produto {i + 1}</legend>
            <div>
              <label htmlFor={`${id}-nome`} className={CLASSE_DO_ROTULO}>
                Nome do produto
              </label>
              <input
                id={`${id}-nome`}
                list={LISTA_DE_PRODUTOS}
                value={linha.nome}
                onChange={(e) => mudar(linha.chave, "nome", e.target.value)}
                autoComplete="off"
                autoFocus={linha.chave === focar}
                maxLength={MAX_NOME_DO_PRODUTO}
                placeholder="Ex.: Vestido midi canelado"
                className={CLASSE_DO_CAMPO}
              />
            </div>
            <div className="grid grid-cols-[76px_minmax(0,1fr)_44px] items-end gap-2">
              <div>
                <label htmlFor={`${id}-qtd`} className={CLASSE_DO_ROTULO}>
                  Qtd
                </label>
                <input
                  id={`${id}-qtd`}
                  inputMode="numeric"
                  value={linha.quantidade}
                  onChange={(e) => mudar(linha.chave, "quantidade", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className={cn(CLASSE_DO_CAMPO, "font-data text-center")}
                />
              </div>
              <div>
                <label htmlFor={`${id}-valor`} className={CLASSE_DO_ROTULO}>
                  Valor un. (R$)
                </label>
                <input
                  id={`${id}-valor`}
                  inputMode="decimal"
                  value={linha.valor}
                  onChange={(e) => mudar(linha.chave, "valor", e.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder="0,00"
                  className={cn(CLASSE_DO_CAMPO, "font-data")}
                />
              </div>
              <button
                type="button"
                aria-label={`Remover produto ${i + 1}`}
                disabled={linhas.length === 1}
                onClick={() => remover(linha.chave)}
                className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 text-slate-600 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-right text-13 text-slate-600">
              Subtotal <span className="font-data font-medium text-volt-950">{brl.format(subtotalDaLinha(linha))}</span>
            </p>
          </fieldset>
        );
      })}

      <button
        type="button"
        onClick={adicionar}
        disabled={linhas.length >= MAX_ITENS}
        className="inline-flex h-11 items-center gap-1.5 self-start rounded-[var(--radius-control)] border border-dashed border-line-200 px-3.5 text-[14px] font-semibold text-volt-950 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Adicionar produto
      </button>

      <div className="flex items-baseline justify-between gap-3 pt-1">
        <span className="text-[14px] font-semibold text-volt-950">Total · {rotuloDePecas(pecasDasLinhas(linhas))}</span>
        <span data-testid="vendas-total" className="font-data text-20 font-semibold tabular-nums text-volt-950">
          {brl.format(total)}
        </span>
      </div>

      {erro && (
        <p role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="h-12 rounded-[var(--radius-control)] bg-cobalt-500 text-15 font-semibold text-paper-0 disabled:opacity-50"
      >
        {enviando ? "Salvando…" : `${verbo} · ${brl.format(total)}`}
      </button>
    </form>
  );
}
