"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { ItemDeVenda, VendaDoMes, VendasDoMes } from "@/lib/vendas/tipos";
import { ANEL_DE_FOCO, FormularioDeItens } from "./itens-da-venda";

export type MinhasVendasEstado = {
  dados: VendasDoMes | null;
  /** A última leitura falhou. Com `dados`, a lista anterior continua na tela. */
  erro: boolean;
  /** false só quando esta leitura era a mais recente e falhou. */
  recarregar: () => Promise<boolean>;
};

/**
 * `GET /api/vendas` do mês corrente (Brasília). Recarregar mantém a lista na
 * tela até a resposta: depois de registrar, a venda nova entra sem esqueleto.
 */
export function useMinhasVendas(): MinhasVendasEstado {
  const [dados, setDados] = useState<VendasDoMes | null>(null);
  const [erro, setErro] = useState(false);
  // Leituras se cruzam (registrar e corrigir em seguida): só a última pedida escreve na tela.
  const ultima = useRef(0);

  const recarregar = useCallback(async () => {
    const esta = ++ultima.current;
    try {
      const res = await fetch("/api/vendas", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/vendas ${res.status}`);
      const lidos = (await res.json()) as VendasDoMes;
      if (esta === ultima.current) {
        setDados(lidos);
        setErro(false);
      }
      return true;
    } catch {
      if (esta !== ultima.current) return true; // a leitura mais nova responde por si
      setErro(true);
      return false;
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
const SALVA_SEM_LISTA = "Correção salva, mas não deu pra atualizar a lista agora.";

type CorrecaoProps = {
  venda: VendaDoMes;
  cliente: string;
  /** Fecha o painel e devolve o foco ao "Corrigir" da linha. */
  aoFechar: () => void;
  /** A venda saiu da lista (apagada ou não existe mais): fecha e leva o foco ao título. */
  aoSumir: () => void;
  aoMudou: () => Promise<boolean>;
  /** Mensagem fora das linhas: sobrevive à linha que some no recarregamento. */
  avisar: (aviso: string) => void;
};

/**
 * Corrigir (PATCH) e apagar (DELETE), inline na linha — a gramática da Vitrine
 * não usa modal para editar; só a pergunta de apagar vira folha
 * (`useConfirmacao`). 403 recarrega a lista e a linha vira "Fechada": a
 * mensagem fica no painel aberto, que "Cancelar" fecha. 404 também recarrega,
 * mas a linha some junto com o painel — então a mensagem vai para o aviso de
 * `MinhasVendas`, fora das linhas. Salvar, apagar e cancelar se excluem
 * enquanto um pedido está no ar.
 */
function CorrecaoDaVenda({ venda, cliente, aoFechar, aoSumir, aoMudou, avisar }: CorrecaoProps) {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState("");
  const ocupado = salvando || apagando;

  function sumiu(corpo: unknown) {
    avisar(mensagemDeErro(corpo, VENDA_SUMIU));
    aoSumir();
    void aoMudou();
  }

  async function salvar(itens: ItemDeVenda[]): Promise<string | null> {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/vendas/${venda.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      if (!res.ok) {
        const corpo: unknown = await res.json().catch(() => null);
        if (res.status === 404) {
          sumiu(corpo);
          return null; // a mensagem está no aviso; repetida no painel que some, seria lida duas vezes
        }
        if (res.status === 403) void aoMudou();
        return mensagemDeErro(corpo, ERRO_AO_SALVAR);
      }
      const atualizou = await aoMudou();
      avisar(atualizou ? "" : SALVA_SEM_LISTA);
      aoFechar();
      return null;
    } catch {
      return ERRO_AO_SALVAR;
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (ocupado) return;
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
        if (res.status === 404) {
          sumiu(corpo);
          return;
        }
        if (res.status === 403) void aoMudou();
        setErro(mensagemDeErro(corpo, ERRO_AO_APAGAR));
        return;
      }
      avisar("");
      aoSumir();
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
        nivelDoTitulo="h3"
        linhasIniciais={linhasDaVenda(venda)}
        verbo="Salvar correção"
        aoEnviar={salvar}
        bloqueado={apagando}
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
          disabled={ocupado}
          className={cn(
            "min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-semibold text-volt-950 disabled:opacity-50",
            ANEL_DE_FOCO,
          )}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void apagar()}
          disabled={ocupado}
          className={cn(
            "min-h-11 rounded-[var(--radius-control)] px-4 text-[14px] font-semibold text-danger-700 disabled:opacity-50",
            ANEL_DE_FOCO,
          )}
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
  aoFocarTitulo: () => void;
  aoMudou: () => Promise<boolean>;
  avisar: (aviso: string) => void;
};

/**
 * Uma venda: quem, o quê, quando, quanto; "Corrigir" até 24h (`editavel` vem do servidor), depois "Fechada".
 * A do Bling leva o selo e nunca se corrige aqui: "Altere no Bling" (ele é a fonte da verdade).
 */
function VendaNaLista({ venda, agora, corrigindo, aoAbrir, aoFechar, aoFocarTitulo, aoMudou, avisar }: VendaNaListaProps) {
  const cliente = nomeDoCliente(venda);
  const doBling = venda.origem === "bling";
  const idPainel = `painel-corrigir-${venda.id}`;
  const corrigirRef = useRef<HTMLButtonElement>(null);

  // O foco sai do painel antes de ele desmontar, senão cai no `body`. Depois de um 403 a linha
  // virou "Fechada" e o botão não existe mais: o foco vai para o título.
  function fechar() {
    if (corrigirRef.current) corrigirRef.current.focus();
    else aoFocarTitulo();
    aoFechar();
  }

  function sumir() {
    aoFocarTitulo();
    aoFechar();
  }

  return (
    <li className="border-b border-line-200 last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-volt-950">
            <span className="truncate">{cliente}</span>
            {doBling && <span className="pn-chip shrink-0">Bling</span>}
          </p>
          <p className="mt-0.5 truncate text-12 text-slate-600">{resumoDosItens(venda.itens)}</p>
          <p className="font-data mt-0.5 text-12 text-slate-600">{quandoFoi(venda.criadaEm, agora)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-data text-[14px] font-semibold tabular-nums text-volt-950">{brl.format(venda.total)}</span>
          {doBling ? (
            <span
              title="Venda importada do Bling: para corrigir, altere o pedido no Bling"
              className="inline-flex items-center gap-1 text-12 text-slate-600"
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              Altere no Bling
              <span className="sr-only">: venda importada, o pedido se corrige no Bling</span>
            </span>
          ) : venda.editavel ? (
            <button
              ref={corrigirRef}
              type="button"
              aria-expanded={corrigindo}
              aria-controls={idPainel}
              aria-label={`${corrigindo ? "Fechar correção" : "Corrigir venda"} de ${cliente}`}
              onClick={corrigindo ? fechar : aoAbrir}
              className={cn(
                "min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-12 font-semibold text-volt-950",
                ANEL_DE_FOCO,
              )}
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
          <CorrecaoDaVenda
            venda={venda}
            cliente={cliente}
            aoFechar={fechar}
            aoSumir={sumir}
            aoMudou={aoMudou}
            avisar={avisar}
          />
        </div>
      )}
    </li>
  );
}

/**
 * "Minhas vendas · mês" (spec §4): total vendido por ela no mês e a lista, mais
 * recentes primeiro. Só as vendas de quem chamou — o caixa da loja fica com
 * dono e admin (decisão de 07/10) —, mais as do Bling da loja para quem não é
 * vendedora: aí o total deixa de ser só "por você". `truncado`: o PostgREST
 * corta em 1000 sem erro, e a tela diz que o total é parcial (spec §3).
 */
export function MinhasVendas({ estado }: { estado: MinhasVendasEstado }) {
  const { dados, erro, recarregar } = estado;
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const agora = new Date();
  const comBling = dados?.vendas.some((venda) => venda.origem === "bling") ?? false;

  return (
    <section aria-labelledby="minhas-vendas-titulo" className="mt-2 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="minhas-vendas-titulo" ref={tituloRef} tabIndex={-1} className="font-brand text-15 font-bold text-volt-950">
          Minhas vendas · {nomeDoMes(dados?.mes ?? monthBR(agora))}
        </h2>
        {dados && <span className="text-13 text-slate-600">{rotuloDeVendas(dados.quantidade)}</span>}
      </div>

      {/* Sempre montado: o aviso nasce quando a linha some, e região inserida já com texto não é anunciada. */}
      <p role="alert" className="text-13 text-danger-700 empty:hidden">
        {aviso}
      </p>

      {dados ? (
        <>
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-volt-950 px-4 py-3.5">
            <span className="text-13 text-canvas-100">{comBling ? "Vendido no mês" : "Vendido por você no mês"}</span>
            <span data-testid="vendas-total-do-mes" className="font-data text-20 font-semibold tabular-nums text-paper-0">
              {brl.format(dados.total)}
            </span>
          </div>
          {dados.truncado && (
            <p className="text-13 text-slate-600">Total parcial: o mês passou de mil vendas e a lista mostra as mais recentes.</p>
          )}
          {erro && !aviso && (
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
                  aoAbrir={() => {
                    setAviso("");
                    setCorrigindo(venda.id);
                  }}
                  // Só fecha o painel DESTA venda: uma resposta atrasada não fecha o que ela abriu depois.
                  aoFechar={() => setCorrigindo((atual) => (atual === venda.id ? null : atual))}
                  aoFocarTitulo={() => tituloRef.current?.focus()}
                  aoMudou={recarregar}
                  avisar={setAviso}
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
            className={cn("min-h-11 rounded-[var(--radius-control)] border border-line-200 px-3 text-13 font-semibold text-volt-950", ANEL_DE_FOCO)}
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
