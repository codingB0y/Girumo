"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { brl } from "@/components/painel/home/format";
import { monthBR } from "@/lib/date-br";
import {
  linhasDaVenda,
  mensagemDeErro,
  nomeDoCliente,
  nomeDoMes,
  quandoFoi,
  resumoDosItens,
  rotuloDeVendas,
} from "@/lib/painel/vendas";
import type { ItemDeVenda, VendaDoMes, VendasDoMes } from "@/lib/vendas/tipos";
import { FormularioDeItens } from "./itens-da-venda";

export type MinhasVendasEstado = {
  dados: VendasDoMes | null;
  /** A última leitura falhou. Com `dados`, a lista anterior continua na tela. */
  erro: boolean;
  recarregar: () => Promise<void>;
};

/**
 * `GET /api/vendas` do mês corrente (Brasília). Recarregar mantém a lista na
 * tela até a resposta: depois de registrar, a venda nova entra sem esqueleto.
 */
export function useMinhasVendas(): MinhasVendasEstado {
  const [dados, setDados] = useState<VendasDoMes | null>(null);
  const [erro, setErro] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch("/api/vendas", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/vendas ${res.status}`);
      setDados((await res.json()) as VendasDoMes);
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, recarregar };
}

const ERRO_AO_SALVAR = "Não deu pra salvar a correção. Tente de novo.";
const ERRO_AO_APAGAR = "Não deu pra apagar a venda. Tente de novo.";
// Fallback só para resposta sem `{ error }`; com corpo, vale o da API (`MESSAGES.notFound`, PR 4).
const VENDA_SUMIU = "Venda não encontrada.";

type CorrecaoProps = {
  venda: VendaDoMes;
  cliente: string;
  aoFechar: () => void;
  aoMudou: () => Promise<void>;
};

/**
 * Corrigir (PATCH) e apagar (DELETE), inline na linha — a gramática da Vitrine
 * não usa modal para editar; só a pergunta de apagar vira folha
 * (`useConfirmacao`). 403 e 404 recarregam a lista: a linha vira "Fechada" ou
 * some, e a mensagem do servidor fica no painel aberto, que "Cancelar" fecha.
 */
function CorrecaoDaVenda({ venda, cliente, aoFechar, aoMudou }: CorrecaoProps) {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(itens: ItemDeVenda[]): Promise<string | null> {
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      if (!res.ok) {
        const corpo: unknown = await res.json().catch(() => null);
        if (res.status === 403 || res.status === 404) void aoMudou();
        return mensagemDeErro(corpo, res.status === 404 ? VENDA_SUMIU : ERRO_AO_SALVAR);
      }
      await aoMudou();
      aoFechar();
      return null;
    } catch {
      return ERRO_AO_SALVAR;
    }
  }

  async function apagar() {
    const confirmou = await pedirConfirmacao({
      titulo: "Apagar esta venda?",
      texto: `A venda de ${cliente} (${brl.format(venda.total)}) sai das suas vendas e do caixa da loja. Não dá pra desfazer.`,
      rotulo: "Apagar venda",
      destrutivo: true,
    });
    if (!confirmou) return;
    setApagando(true);
    setErro("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, { method: "DELETE" });
      if (!res.ok) {
        const corpo: unknown = await res.json().catch(() => null);
        if (res.status === 403 || res.status === 404) void aoMudou();
        setErro(mensagemDeErro(corpo, res.status === 404 ? VENDA_SUMIU : ERRO_AO_APAGAR));
        return;
      }
      aoFechar();
      await aoMudou();
    } catch {
      setErro(ERRO_AO_APAGAR);
    } finally {
      setApagando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FormularioDeItens
        idBase={`corrigir-${venda.id}`}
        titulo="Corrigir venda"
        linhasIniciais={linhasDaVenda(venda)}
        verbo="Salvar correção"
        aoEnviar={salvar}
      />
      {erro && (
        <p role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={aoFechar}
          className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-semibold text-volt-950"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void apagar()}
          disabled={apagando}
          className="min-h-11 rounded-[var(--radius-control)] px-4 text-[14px] font-semibold text-danger-700 disabled:opacity-50"
        >
          {apagando ? "Apagando…" : "Apagar venda"}
        </button>
      </div>
      {folhaDeConfirmacao}
    </div>
  );
}

type VendaNaListaProps = {
  venda: VendaDoMes;
  agora: Date;
  corrigindo: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  aoMudou: () => Promise<void>;
};

/** Uma venda: quem, o quê, quando, quanto; "Corrigir" até 24h (`editavel` vem do servidor), depois "Fechada". */
function VendaNaLista({ venda, agora, corrigindo, aoAbrir, aoFechar, aoMudou }: VendaNaListaProps) {
  const cliente = nomeDoCliente(venda);
  const idPainel = `painel-corrigir-${venda.id}`;
  return (
    <li className="border-b border-line-200 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-volt-950">{cliente}</p>
          <p className="mt-0.5 truncate text-12 text-slate-600">{resumoDosItens(venda.itens)}</p>
          <p className="font-data mt-0.5 text-12 text-slate-600">{quandoFoi(venda.criadaEm, agora)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-data text-[14px] font-semibold tabular-nums text-volt-950">{brl.format(venda.total)}</span>
          {venda.editavel ? (
            <button
              type="button"
              aria-expanded={corrigindo}
              aria-controls={idPainel}
              aria-label={`${corrigindo ? "Fechar correção" : "Corrigir venda"} de ${cliente}`}
              onClick={corrigindo ? aoFechar : aoAbrir}
              className="min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-12 font-semibold text-volt-950"
            >
              {corrigindo ? "Fechar" : "Corrigir"}
            </button>
          ) : (
            <span title="Passou de 24h: só o dono corrige" className="inline-flex items-center gap-1 text-12 text-slate-600">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Fechada
              <span className="sr-only">: passou de 24 horas, só o dono da loja corrige</span>
            </span>
          )}
        </div>
      </div>
      {corrigindo && (
        <div id={idPainel} className="px-4 pb-4">
          <CorrecaoDaVenda venda={venda} cliente={cliente} aoFechar={aoFechar} aoMudou={aoMudou} />
        </div>
      )}
    </li>
  );
}

/**
 * "Minhas vendas · mês" (spec §4): total vendido por ela no mês e a lista, mais
 * recentes primeiro. Só as vendas de quem chamou — o caixa da loja fica com
 * dono e admin (decisão de 07/10). `truncado`: o PostgREST corta em 1000 sem
 * erro, e a tela diz que o total é parcial (spec §3).
 */
export function MinhasVendas({ estado }: { estado: MinhasVendasEstado }) {
  const { dados, erro, recarregar } = estado;
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const agora = new Date();

  return (
    <section aria-labelledby="minhas-vendas-titulo" className="mt-2 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="minhas-vendas-titulo" className="font-brand text-15 font-bold text-volt-950">
          Minhas vendas · {nomeDoMes(dados?.mes ?? monthBR(agora))}
        </h2>
        {dados && <span className="text-13 text-slate-600">{rotuloDeVendas(dados.quantidade)}</span>}
      </div>

      {dados ? (
        <>
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-volt-950 px-4 py-3.5">
            <span className="text-13 text-canvas-100">Vendido por você no mês</span>
            <span data-testid="vendas-total-do-mes" className="font-data text-20 font-semibold tabular-nums text-paper-0">
              {brl.format(dados.total)}
            </span>
          </div>
          {dados.truncado && (
            <p className="text-13 text-slate-600">Total parcial: o mês passou de mil vendas e a lista mostra as mais recentes.</p>
          )}
          {erro && (
            <p role="alert" className="text-13 text-danger-700">
              Não deu pra atualizar a lista agora.
            </p>
          )}
          {dados.vendas.length === 0 ? (
            <p className="rounded-xl border border-line-200 bg-paper-0 px-4 py-6 text-center text-[14px] text-slate-600">
              Nenhuma venda registrada neste mês.
            </p>
          ) : (
            <ul className="rounded-xl border border-line-200 bg-paper-0">
              {dados.vendas.map((venda) => (
                <VendaNaLista
                  key={venda.id}
                  venda={venda}
                  agora={agora}
                  corrigindo={corrigindo === venda.id}
                  aoAbrir={() => setCorrigindo(venda.id)}
                  aoFechar={() => setCorrigindo(null)}
                  aoMudou={recarregar}
                />
              ))}
            </ul>
          )}
        </>
      ) : erro ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-200 bg-paper-0 px-4 py-3 text-[14px] text-volt-950"
        >
          Não deu pra carregar suas vendas agora.
          <button
            type="button"
            onClick={() => void recarregar()}
            className="min-h-11 rounded-[var(--radius-control)] border border-line-200 px-3 text-13 font-semibold text-volt-950"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <div role="status" aria-label="Carregando suas vendas" className="space-y-2.5">
          <div className="pn-skeleton h-14 rounded-xl" data-testid="painel-skeleton" />
          <div className="pn-skeleton h-40 rounded-xl" data-testid="painel-skeleton" />
        </div>
      )}
    </section>
  );
}
