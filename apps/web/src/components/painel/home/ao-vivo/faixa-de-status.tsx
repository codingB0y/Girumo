"use client";

import { ContraSemanaPassada, Celula, EntrouSaiu, Faisca } from "@/components/painel/numeros";
import type { Order, TrackedLink } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { medindoDesde, saldo } from "@/lib/painel/atividade-texto";
import { atualizadoHa, comparacaoComecaEm, numerosDaFaixa, pedidosDeHoje } from "@/lib/painel/ao-vivo/faixa";
import { numero } from "@/lib/painel/grupos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

type Props = {
  atividade: AtividadeDaCampanha | null;
  links: TrackedLink[];
  orders: Order[];
  metaDoMes: number | null;
  agora: Date;
  /** Falso = a parte não carregou: mostrar isso, não um zero que parece fato. */
  ordersOk: boolean;
  linksOk: boolean;
  settingsOk: boolean;
};

/** A faixa de status da Início "Ao vivo": a loja inteira hoje, numa linha. */
export function FaixaDeStatus({ atividade, links, orders, metaDoMes, agora, ordersOk, linksOk, settingsOk }: Props) {
  const n = atividade ? numerosDaFaixa(atividade) : null;
  const pedidos = pedidosDeHoje(orders, metaDoMes, agora);
  const cliquesNoTotal = links.reduce((s, l) => s + (l.clicks ?? 0), 0);

  return (
    <section data-testid="inicio-faixa" aria-label="A loja hoje" className="overflow-hidden rounded-[10px] border border-line-200 bg-line-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-paper-0 px-5 py-2.5">
        <p className="flex items-center gap-2.5">
          <span className="pn-chip pn-chip--acid">
            <span aria-hidden="true">●</span> AO VIVO
          </span>
          <span className="text-13 text-slate-600">
            {primeiraMaiuscula(DIA.format(agora))} · {horaBR(agora.toISOString())}
          </span>
        </p>
        <p className="text-12 text-slate-600">{atividade ? atualizadoHa(atividade.geradoEm, agora) : "a série não carregou"}</p>
      </div>

      <div className="mt-px grid gap-px sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]">
        <div className="bg-paper-0 px-5 py-4 sm:col-span-2 lg:col-span-1">
          <p className="text-13 text-slate-600">Entraram hoje</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-[44px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">
              {n ? numero(n.entraram) : "—"}
            </p>
            {n && <Faisca barras={n.seteDias} />}
          </div>
          <p className="mt-2 text-13 text-slate-600">
            {!n
              ? "a série não carregou"
              : n.comparacao.tipo === "contra"
                ? <ContraSemanaPassada hoje={n.entraram} antes={n.comparacao.antes} diaPassado={n.comparacao.diaPassado} />
                : `${medindoDesde(n.comparacao.desde)} · a comparação com a semana passada começa em ${comparacaoComecaEm(n.comparacao.desde)}`}
          </p>
        </div>
        <Celula rotulo="Saíram hoje" valor={n ? numero(n.sairam) : "—"}>
          {n && <EntrouSaiu entraram={n.entraram} sairam={n.sairam} />}
          {n ? "nos grupos em que você é admin" : null}
        </Celula>
        <Celula rotulo="Saldo hoje" valor={n ? saldo(n.saldo) : "—"}>
          {n ? `${saldo(n.saldoSemana)} ${n.comparacao.tipo === "medindo" ? "na semana (medido)" : "em 7 dias"}` : null}
        </Celula>
        <Celula rotulo="Cliques nos links hoje" valor={n ? numero(n.cliques) : "—"}>
          {!linksOk
            ? "os links não carregaram"
            : cliquesNoTotal === 0
              ? "ninguém clicou num link ainda"
              : `${numero(cliquesNoTotal)} no total`}
        </Celula>
        <Celula rotulo="Pedidos anotados hoje" valor={ordersOk ? brl.format(pedidos.valor) : "—"} className="sm:col-span-2 lg:col-span-1">
          {!ordersOk ? (
            "os pedidos não carregaram"
          ) : (
            <>
              {pedidos.quantidade === 0 ? "nenhum pedido hoje" : `${numero(pedidos.quantidade)} ${pedidos.quantidade === 1 ? "pedido" : "pedidos"}`}
              {" · "}
              {!settingsOk ? "meta não carregou" : pedidos.metaPct === null ? "sem meta do mês" : `${pedidos.metaPct}% da meta do mês`}
            </>
          )}
        </Celula>
      </div>
    </section>
  );
}
