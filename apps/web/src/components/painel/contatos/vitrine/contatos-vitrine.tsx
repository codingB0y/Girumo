"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { brl } from "@/components/painel/home/format";
import { Odometro } from "@/components/painel/home/vitrine/odometro";
import { diaHoraCurto, iniciais, marcasDaFita, rotulosDaFita } from "@/lib/painel/inicio";
import { ordersInMonth, revenueInMonth, type MonthlyOrder } from "@/lib/painel-metrics";
import { monthBR } from "@/lib/date-br";
import type { Lead, LeadStatus } from "@/lib/painel/types";

const PASSO_DA_MARCA = 5_000;

type Filtro = "todos" | LeadStatus;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "novo", rotulo: "Novos" },
  { valor: "ativo", rotulo: "Ativos" },
  { valor: "comprou", rotulo: "Clientes" },
];

const CHIP: Record<LeadStatus, { texto: string; classe: string }> = {
  novo: { texto: "NOVO", classe: "bg-canvas-100 text-volt-950" },
  ativo: { texto: "ATIVO", classe: "bg-canvas-100 text-volt-950" },
  comprou: { texto: "CLIENTE", classe: "bg-canvas-100 text-volt-950" },
};

type Props = {
  contatos: readonly Lead[];
  pedidos: readonly MonthlyOrder[];
  meta: number | null;
  carregando: boolean;
  /** Some o pedido no total do mês na hora, para o caixa subir sem esperar o refetch. */
  onPedidoRegistrado: (valor: number) => void;
};

/**
 * Contatos na Vitrine Aberta: a lista de quem entrou, e o caixa do mês grudado
 * no rodapé. Registrar um pedido faz o número subir ali mesmo — é a cena 4 do
 * roteiro ("o caixa sobe"), e é também o que a lojista quer ver: a conta do mês
 * andando enquanto ela atende.
 */
export function ContatosVitrine({ contatos, pedidos, meta, carregando, onPedidoRegistrado }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [registrando, setRegistrando] = useState<string | null>(null);

  const agora = new Date();
  const mes = monthBR(agora);
  const pedidosDoMes = ordersInMonth(pedidos, mes);
  // Contar todos os pedidos ao lado de um valor que é só do mês dá "R$ 0,00 · 15 pedidos".
  const faturamento = revenueInMonth(pedidos, mes);

  const contagens = useMemo(() => {
    const c: Record<string, number> = { todos: contatos.length, novo: 0, ativo: 0, comprou: 0 };
    for (const l of contatos) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [contatos]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contatos.filter(
      (l) =>
        (filtro === "todos" || l.status === filtro) &&
        (termo === "" || l.name?.toLowerCase().includes(termo) || l.phone?.includes(termo)),
    );
  }, [contatos, filtro, busca]);

  if (carregando) {
    return (
      <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-5 lg:px-8 lg:py-8">
        <div className="pn-skeleton h-16 rounded-xl" data-testid="painel-skeleton" />
        <div className="pn-skeleton h-80 rounded-xl" data-testid="painel-skeleton" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-8 lg:py-8">
      <header data-testid="contatos-cabecalho">
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Contatos</h1>
        <p className="mt-1 text-[14px] text-slate-600">
          {contatos.length === 0
            ? "Ninguém entrou ainda. Quem entrar pelos seus grupos aparece aqui."
            : `${contatos.length} ${contatos.length === 1 ? "pessoa" : "pessoas"} · ${contagens.comprou ?? 0} ${
                (contagens.comprou ?? 0) === 1 ? "já comprou" : "já compraram"
              }`}
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar contatos">
          {FILTROS.map((f) => {
            const ativo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => setFiltro(f.valor)}
                aria-pressed={ativo}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[14px]",
                  ativo ? "bg-volt-950 text-paper-0" : "bg-paper-0 text-volt-950 hover:bg-canvas-100",
                )}
              >
                {f.rotulo}
                <span className="font-data tabular-nums opacity-70">{contagens[f.valor] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor="contatos-busca">
            Buscar contato
          </label>
          <input
            id="contatos-busca"
            data-testid="contatos-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar contato"
            className="h-10 w-[280px] max-w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 pl-9 pr-3 text-[16px] text-volt-950 placeholder:text-slate-600"
          />
        </div>
      </div>

      <section className="mt-4" data-testid="contatos-lista">
        {visiveis.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-slate-600">
            {contatos.length === 0 ? "A lista enche sozinha quando alguém entra num grupo seu." : "Ninguém com esse filtro."}
          </p>
        ) : (
          <ul>
            {visiveis.map((l) => (
              <li key={l.id}>
                <FichaDoContato
                  contato={l}
                  agora={agora}
                  registrando={registrando === l.id}
                  onAbrir={() => setRegistrando(registrando === l.id ? null : l.id)}
                  onFechar={() => setRegistrando(null)}
                  onRegistrado={onPedidoRegistrado}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CaixaDoRodape faturamento={faturamento} meta={meta} pedidos={pedidosDoMes.length} />
    </div>
  );
}

/**
 * O caixa do mês, grudado embaixo. Sobe no lugar quando um pedido é registrado:
 * a lojista não precisa voltar para a Início para ver a conta andar.
 */
function CaixaDoRodape({
  faturamento,
  meta,
  pedidos,
}: {
  faturamento: number;
  meta: number | null;
  pedidos: number;
}) {
  const progresso = meta && meta > 0 ? Math.min(1, faturamento / meta) : 0;

  return (
    <div
      data-testid="contatos-caixa"
      className="sticky bottom-[var(--spacing-barra-mobile)] z-10 mt-8 border-t border-line-200 bg-canvas-100 py-4 lg:bottom-0"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-13 text-slate-600">Vendido no mês</p>
          <Odometro
            valor={brl.format(faturamento)}
            className="font-brand block text-[28px] font-extrabold leading-none tracking-[-0.02em] text-volt-950 lg:text-32"
          />
        </div>
        <p className="font-data text-13 tabular-nums text-slate-600">
          {pedidos} {pedidos === 1 ? "pedido no mês" : "pedidos no mês"}
          {meta && meta > 0 ? ` · de ${brl.format(meta)}` : ""}
        </p>
      </div>

      {meta && meta > 0 && (
        <>
          <div
            className="pn-fita mt-3"
            role="progressbar"
            aria-valuenow={Math.round(progresso * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${brl.format(faturamento)} de ${brl.format(meta)}`}
            style={{ ["--p" as string]: progresso }}
          >
            {Array.from({ length: marcasDaFita(meta, PASSO_DA_MARCA) - 1 }, (_, i) => (
              <i
                key={i}
                className="pn-fita__marca"
                style={{ left: `${((i + 1) / marcasDaFita(meta, PASSO_DA_MARCA)) * 100}%` }}
                aria-hidden="true"
              />
            ))}
            <span className="pn-fita__cursor" aria-hidden="true" />
          </div>
          <div className="pn-fita__rotulos" aria-hidden="true">
            {rotulosDaFita(meta).map((r) => (
              <span key={r.posicao} style={{ left: `${r.posicao}%` }}>
                {r.texto}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FichaDoContato({
  contato,
  agora,
  registrando,
  onAbrir,
  onFechar,
  onRegistrado,
}: {
  contato: Lead;
  agora: Date;
  registrando: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onRegistrado: (valor: number) => void;
}) {
  const chip = CHIP[contato.status];

  return (
    <div className="border-b border-line-200">
      <div className="flex flex-wrap items-center gap-3 py-3 lg:h-16 lg:flex-nowrap lg:py-0">
        <span
          className="font-data inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas-100 text-12 text-volt-950"
          aria-hidden="true"
        >
          {iniciais(contato.name || contato.phone || "?")}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-15 font-semibold text-volt-950">{contato.name?.trim() || contato.phone}</p>
          <p className="font-data mt-0.5 truncate text-12 text-slate-600">
            veio pelo {contato.sourceGroup || "grupo"} · {diaHoraCurto(contato.enteredAt, agora)}
          </p>
        </div>

        <span
          className={cn(
            "font-data inline-flex h-6 shrink-0 items-center rounded-[var(--radius-chip)] px-2 text-12",
            chip.classe,
          )}
        >
          {chip.texto}
        </span>

        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={registrando}
          className="h-9 shrink-0 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 text-volt-950"
        >
          {registrando ? "Fechar" : "Registrar pedido"}
        </button>
      </div>

      {registrando && <RegistroDePedido contato={contato} onFechar={onFechar} onRegistrado={onRegistrado} />}
    </div>
  );
}

/** Inline na ficha, como o editor de grupo: a gramática não usa modal. */
function RegistroDePedido({
  contato,
  onFechar,
  onRegistrado,
}: {
  contato: Lead;
  onFechar: () => void;
  onRegistrado: (valor: number) => void;
}) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (salvando) return;
    const centavos = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(centavos) || centavos <= 0) {
      setErro("Digite o valor do pedido.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: valor, leadId: contato.id, phone: contato.phone, group: contato.sourceGroup }),
      });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível registrar o pedido.");
        return;
      }
      onRegistrado(centavos);
      onFechar();
    } catch {
      setErro("Não foi possível registrar o pedido.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <div>
        <label className="mb-1 block text-13 font-semibold text-volt-950" htmlFor={`pedido-${contato.id}`}>
          Valor do pedido
        </label>
        <input
          id={`pedido-${contato.id}`}
          data-testid="contatos-valor"
          autoFocus
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="149,90"
          className="h-11 w-40 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 text-[16px] text-volt-950 placeholder:text-slate-600"
        />
      </div>
      <button
        type="submit"
        disabled={salvando || !valor.trim()}
        className="h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[14px] font-semibold text-paper-0 disabled:opacity-50"
      >
        {salvando ? "Salvando…" : "Salvar"}
      </button>
      {erro && (
        <p role="alert" className="w-full text-13 text-danger-700">
          {erro}
        </p>
      )}
    </form>
  );
}
