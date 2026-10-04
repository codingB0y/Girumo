"use client";

import { useEffect, useRef, useState } from "react";
import { ContraSemanaPassada, Celula, EntrouSaiu, Faisca } from "@/components/painel/numeros";
import type { Order, TrackedLink } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { medindoDesde, saldo } from "@/lib/painel/atividade-texto";
import { atualizadoHa, comparacaoComecaEm, numerosDaFaixa, pedidosDeHoje } from "@/lib/painel/ao-vivo/faixa";
import { numero } from "@/lib/painel/grupos";
import { EditorDaMeta, useSalvarMeta } from "./meta-do-mes";

/** A célula como item da faixa rolável do celular: largura pelo conteúdo, um fio à esquerda. */
const NA_FAIXA = "max-md:flex-none max-md:whitespace-nowrap max-md:px-4 max-md:py-3";
/** Número de 28 px no celular (o 2º `p` da `Celula`; 30 px a partir de md). */
const NUMERO_28 = "max-md:[&>p:nth-of-type(2)]:text-[28px]";
const COM_FIO = "max-md:border-l max-md:border-line-200";

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
  /** Meta de receita gravada: a tela atualiza o dado sem recarregar. */
  onMetaSalva: (valor: number) => void;
};

const BOTAO_DA_META = "font-semibold text-cobalt-500 underline-offset-2 hover:underline";

/** A faixa de status da Início "Ao vivo": a loja inteira hoje, numa linha. */
export function FaixaDeStatus({ atividade, links, orders, metaDoMes, agora, ordersOk, linksOk, settingsOk, onMetaSalva }: Props) {
  const [editando, setEditando] = useState(false);
  const botaoDaMeta = useRef<HTMLButtonElement>(null);
  const jaEditou = useRef(false);
  const { salvando, salvar } = useSalvarMeta(onMetaSalva);
  // Fechar o editor (Esc, Cancelar, Salvar) devolve o foco ao botão que o abriu.
  useEffect(() => {
    if (editando) jaEditou.current = true;
    else if (jaEditou.current) botaoDaMeta.current?.focus();
  }, [editando]);

  const n = atividade ? numerosDaFaixa(atividade) : null;
  const pedidos = pedidosDeHoje(orders, metaDoMes, agora);
  const cliquesNoTotal = links.reduce((s, l) => s + (l.clicks ?? 0), 0);

  return (
    <section data-testid="inicio-faixa" aria-label="A loja hoje" className="overflow-hidden rounded-[10px] border border-line-200 bg-line-200 max-md:-mx-4 max-md:mb-0 max-md:rounded-none max-md:border-x-0">
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

      {/*
        Abaixo de 768 px as cinco células viram uma faixa que rola para o lado (largura pelo conteúdo, um fio
        entre elas); tabIndex deixa as setas rolarem. De 768 px para cima, a grade de sempre.
      */}
      <div
        role="group"
        aria-label="Números de hoje"
        tabIndex={0}
        className="mt-px grid gap-px max-md:flex max-md:gap-0 max-md:overflow-x-auto max-md:bg-paper-0 max-md:[scrollbar-width:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cobalt-500 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]"
      >
        <div className={`bg-paper-0 px-5 py-4 sm:col-span-2 lg:col-span-1 ${NA_FAIXA}`}>
          <p className="text-13 text-slate-600">Entraram hoje</p>
          <div className="mt-2 flex items-end justify-between gap-4 max-md:gap-3">
            <p className="text-[44px] max-md:text-[28px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">
              {n ? numero(n.entraram) : "—"}
            </p>
            {n && <Faisca barras={n.seteDias} />}
          </div>
          {/* No celular a legenda é curta: uma célula mais larga que a tela esconderia as outras quatro. */}
          <p className="mt-2 text-13 text-slate-600">
            {!n ? (
              "a série não carregou"
            ) : n.comparacao.tipo === "contra" ? (
              <>
                <span className="max-md:hidden">
                  <ContraSemanaPassada hoje={n.entraram} antes={n.comparacao.antes} diaPassado={n.comparacao.diaPassado} />
                </span>
                <span className="md:hidden">
                  <ContraSemanaPassada hoje={n.entraram} antes={n.comparacao.antes} diaPassado={n.comparacao.diaPassado} curto />
                </span>
              </>
            ) : (
              <>
                {medindoDesde(n.comparacao.desde)}
                <span className="max-md:hidden"> · a comparação com a semana passada começa em {comparacaoComecaEm(n.comparacao.desde)}</span>
              </>
            )}
          </p>
        </div>
        <Celula rotulo="Saíram hoje" valor={n ? numero(n.sairam) : "—"} className={`${NA_FAIXA} ${COM_FIO} ${NUMERO_28}`}>
          {n && <EntrouSaiu entraram={n.entraram} sairam={n.sairam} />}
          {n ? (
            <>
              <span className="max-md:hidden">nos grupos em que você é admin</span>
              <span className="md:hidden">nos seus grupos</span>
            </>
          ) : null}
        </Celula>
        <Celula rotulo="Saldo hoje" valor={n ? saldo(n.saldo) : "—"} className={`${NA_FAIXA} ${COM_FIO} ${NUMERO_28}`}>
          {n ? `${saldo(n.saldoSemana)} ${n.comparacao.tipo === "medindo" ? "na semana (medido)" : "em 7 dias"}` : null}
        </Celula>
        <Celula rotulo="Cliques nos links hoje" valor={n ? numero(n.cliques) : "—"} className={`${NA_FAIXA} ${COM_FIO} ${NUMERO_28}`}>
          {!linksOk
            ? "os links não carregaram"
            : cliquesNoTotal === 0
              ? <>ninguém clicou<span className="max-md:hidden"> num link</span> ainda</>
              : `${numero(cliquesNoTotal)} no total`}
        </Celula>
        <Celula rotulo="Pedidos anotados hoje" valor={ordersOk ? brl.format(pedidos.valor) : "—"} className={`sm:col-span-2 lg:col-span-1 ${NA_FAIXA} ${COM_FIO} ${NUMERO_28}`}>
          {!ordersOk ? (
            "os pedidos não carregaram"
          ) : (
            <>
              {pedidos.quantidade === 0 ? <>nenhum pedido<span className="max-md:hidden"> hoje</span></> : `${numero(pedidos.quantidade)} ${pedidos.quantidade === 1 ? "pedido" : "pedidos"}`}
              {" · "}
              {!settingsOk ? (
                "meta não carregou"
              ) : (
                <>
                  {pedidos.metaPct === null ? <>sem meta<span className="max-md:hidden"> do mês</span></> : `${pedidos.metaPct}% da meta do mês`}
                  {!editando && (
                    <>
                      {" · "}
                      <button
                        ref={botaoDaMeta}
                        type="button"
                        onClick={() => setEditando(true)}
                        className={BOTAO_DA_META}
                      >
                        {metaDoMes ? "editar meta" : "definir meta"}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {ordersOk && settingsOk && editando && (
            <EditorDaMeta
              meta={metaDoMes}
              salvando={salvando}
              onSalvar={async (texto) => {
                if (await salvar(texto)) setEditando(false);
              }}
              onCancelar={() => setEditando(false)}
            />
          )}
        </Celula>
      </div>
    </section>
  );
}
