"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Faisca } from "@/components/painel/numeros";
import type { Campanha, Order, TrackedLink } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import {
  dataDaFaixa,
  haQuanto,
  legendaDaComparacao,
  legendaDosCliques,
  legendaDosPedidos,
  numerosDaFaixa,
  pedidosDeHoje,
  variacaoNaFaixa,
} from "@/lib/painel/ao-vivo/faixa";
import { numero } from "@/lib/painel/grupos";
import { EditorDaMeta, useSalvarMeta } from "./meta-do-mes";

/*
 * Faixa G2 (spec 2026-10-05, decisão 6), três arranjos num DOM só:
 * - abaixo de 768 px: cabeçalho (AO VIVO · hora · data · "há N min") e quatro células que rolam de lado, sem legenda;
 * - de 768 a 1399 px: o mesmo cabeçalho, com o botão de atualizar, e as células em grade de 2 e depois 4 colunas;
 * - a partir de 1400 px (onde a Início ganha as três colunas): uma linha só, como no mockup.
 * Classes em string pura, sem a função cn: o tailwind-merge 3 lê `text-13` como cor e o apaga ao lado de `text-slate-600`.
 */
const SECAO = [
  "grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden border border-line-200 bg-paper-0",
  "max-md:-mx-4 max-md:border-x-0 md:rounded-[10px]",
  "min-[87.5rem]:flex min-[87.5rem]:items-stretch min-[87.5rem]:px-5",
].join(" ");
const RELOGIO = [
  "col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 px-4 pt-2.5 pb-1.5 md:px-5 md:py-3",
  "min-[87.5rem]:flex-none min-[87.5rem]:flex-col min-[87.5rem]:items-start min-[87.5rem]:justify-center",
  "min-[87.5rem]:gap-1 min-[87.5rem]:py-4 min-[87.5rem]:pl-1 min-[87.5rem]:pr-6",
].join(" ");
const NUMEROS = [
  "col-span-2 row-start-2 flex overflow-x-auto px-4 pb-3 [scrollbar-width:none]",
  "md:grid md:grid-cols-2 md:gap-px md:overflow-visible md:border-t md:border-line-200 md:bg-line-200 md:p-0 lg:grid-cols-4",
  "min-[87.5rem]:flex min-[87.5rem]:min-w-0 min-[87.5rem]:flex-1 min-[87.5rem]:gap-0 min-[87.5rem]:border-t-0 min-[87.5rem]:bg-transparent",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cobalt-500",
].join(" ");
const CELULA = [
  "flex flex-none flex-col whitespace-nowrap border-r border-line-200 bg-paper-0 pt-1.5 pr-[18px] mr-[18px] last:mr-0 last:border-r-0",
  "md:mr-0 md:border-r-0 md:px-5 md:py-4 md:whitespace-normal",
  "min-[87.5rem]:justify-center min-[87.5rem]:border-l min-[87.5rem]:px-6 min-[87.5rem]:whitespace-nowrap",
].join(" ");
/** A célula dos cliques fica com a sobra da linha larga; a legenda dela encurta com "…". */
const CELULA_FLEXIVEL = " min-[87.5rem]:min-w-0 min-[87.5rem]:flex-1";
const NUMERO = "font-display text-28 font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950 md:text-32";
const HORA = "font-display text-[16px] font-bold leading-none tracking-[-0.015em] tabular-nums text-volt-950 min-[87.5rem]:text-28";
const BOTAO_DA_META = "font-semibold text-cobalt-500 underline-offset-2 hover:underline";
const BOTAO_ATUALIZAR = [
  "inline-grid h-9 w-9 place-items-center rounded-[var(--radius-control)] text-slate-600 hover:bg-hover-ficha hover:text-volt-950",
  "focus-visible:outline-2 focus-visible:outline-cobalt-500 max-md:hidden",
].join(" ");
const SEM_SERIE = "a série não carregou";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  atividade: AtividadeDaCampanha | null;
  campanhas: Campanha[];
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
  /** O botão no fim da faixa: a mesma recarga silenciosa que roda a cada minuto. */
  onAtualizar: () => void;
};

/** A faixa de status da Início "Ao vivo" (spec G2, decisão 6): a loja inteira hoje, numa linha. */
export function FaixaDeStatus({ atividade, campanhas, links, orders, metaDoMes, agora, ordersOk, linksOk, settingsOk, onMetaSalva, onAtualizar }: Props) {
  const n = atividade ? numerosDaFaixa(atividade) : null;
  // Semana passada medida: variação nas entradas e nas saídas. Antes disso, só o "medindo desde" da legenda.
  const antes = n && n.comparacao.tipo === "contra" ? n.comparacao.antes : null;
  const cliques = linksOk ? legendaDosCliques(links, campanhas) : "os links não carregaram";

  return (
    <section data-testid="inicio-faixa" aria-label="A loja hoje" className={SECAO}>
      <Relogio agora={agora} />
      {/* tabIndex: no celular as setas do teclado rolam a faixa. */}
      <div role="group" aria-label="Números de hoje" tabIndex={0} className={NUMEROS}>
        <CelulaDaFaixa
          rotulo="Entraram hoje"
          valor={n ? numero(n.entraram) : "—"}
          junto={
            n && (
              <>
                {antes && <Variacao hoje={n.entraram} antes={antes.entraram} />}
                <span className="max-md:hidden">
                  <Faisca barras={n.seteDias} legenda={false} />
                </span>
              </>
            )
          }
          legenda={n ? legendaDaComparacao(n.comparacao, "entraram") : SEM_SERIE}
        />
        <CelulaDaFaixa
          rotulo="Saíram"
          valor={n ? numero(n.sairam) : "—"}
          junto={n && antes && <Variacao hoje={n.sairam} antes={antes.sairam} menosEMelhor />}
          legenda={n ? legendaDaComparacao(n.comparacao, "sairam") : null}
        />
        <CelulaDaFaixa
          rotulo={
            <>
              Cliques<span className="max-md:hidden"> nos links</span>
            </>
          }
          valor={n ? numero(n.cliques) : "—"}
          legenda={cliques}
          legendaInteira={cliques}
        />
        <CelulaDosPedidos orders={orders} metaDoMes={metaDoMes} agora={agora} ordersOk={ordersOk} settingsOk={settingsOk} onMetaSalva={onMetaSalva} />
      </div>
      <Atualizado geradoEm={atividade?.geradoEm ?? null} agora={agora} onAtualizar={onAtualizar} />
    </section>
  );
}

/** AO VIVO, a hora e a data: a primeira célula na linha larga; o cabeçalho da faixa abaixo de 1400 px. */
function Relogio({ agora }: { agora: Date }) {
  const data = dataDaFaixa(agora);
  return (
    <div className={RELOGIO}>
      <span className="pn-chip pn-chip--acid">
        <span aria-hidden="true">●</span> AO VIVO
      </span>
      <time dateTime={agora.toISOString()} className={HORA}>
        {horaBR(agora.toISOString())}
      </time>
      <span className="min-w-0 truncate text-13 text-slate-600">
        <span className="max-md:hidden">{data.longa}</span>
        <span className="md:hidden">{data.curta}</span>
      </span>
    </div>
  );
}

type PropsDaCelula = {
  rotulo: ReactNode;
  valor: string;
  /** Ao lado do número: a variação contra a semana passada (e a faísca, nas entradas). */
  junto?: ReactNode;
  /** Some no celular (spec G2, decisão 6: lá a célula é rótulo, número e variação). */
  legenda: ReactNode;
  /** Só a dos cliques: na linha larga a célula fica com a sobra e a legenda encurta; o texto inteiro vai no title. */
  legendaInteira?: string;
};

function CelulaDaFaixa({ rotulo, valor, junto, legenda, legendaInteira }: PropsDaCelula) {
  const flexivel = legendaInteira !== undefined;
  return (
    <div className={flexivel ? CELULA + CELULA_FLEXIVEL : CELULA}>
      <p className="text-13 text-slate-600">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className={NUMERO}>{valor}</p>
        {junto}
      </div>
      <div title={legendaInteira} className={`mt-1.5 text-13 text-slate-600 max-md:hidden${flexivel ? " min-[87.5rem]:truncate" : ""}`}>
        {legenda}
      </div>
    </div>
  );
}

/** "+18%" ao lado do número: verde quando o movimento é bom (nas saídas, cair é bom). */
function Variacao({ hoje, antes, menosEMelhor = false }: { hoje: number; antes: number; menosEMelhor?: boolean }) {
  const v = variacaoNaFaixa(hoje, antes, menosEMelhor);
  if (!v) return null;
  return (
    <span className={`text-13 font-semibold tabular-nums ${v.bom ? "text-success-700" : "text-danger-700"}`}>
      {v.texto}
      <span className="sr-only"> contra a semana passada</span>
    </span>
  );
}

type PropsDosPedidos = Pick<Props, "orders" | "metaDoMes" | "agora" | "ordersOk" | "settingsOk" | "onMetaSalva">;

/** "Pedidos anotados hoje" com o editor da meta do mês: o único lugar do painel onde ela se define. */
function CelulaDosPedidos({ orders, metaDoMes, agora, ordersOk, settingsOk, onMetaSalva }: PropsDosPedidos) {
  const [editando, setEditando] = useState(false);
  const botaoDaMeta = useRef<HTMLButtonElement>(null);
  const jaEditou = useRef(false);
  const { salvando, salvar } = useSalvarMeta(onMetaSalva);
  // Fechar o editor (Esc, Cancelar, Salvar) devolve o foco ao botão que o abriu.
  useEffect(() => {
    if (editando) jaEditou.current = true;
    else if (jaEditou.current) botaoDaMeta.current?.focus();
  }, [editando]);

  const pedidos = pedidosDeHoje(orders, metaDoMes, agora);
  const legenda = !ordersOk ? (
    "os pedidos não carregaram"
  ) : (
    <>
      {legendaDosPedidos(pedidos, agora, settingsOk)}
      {settingsOk && !editando && (
        <>
          {" · "}
          <button ref={botaoDaMeta} type="button" onClick={() => setEditando(true)} className={BOTAO_DA_META}>
            {metaDoMes ? "editar meta" : "definir meta"}
          </button>
        </>
      )}
      {settingsOk && editando && (
        <EditorDaMeta
          meta={metaDoMes}
          salvando={salvando}
          onSalvar={async (texto) => {
            if (await salvar(texto)) setEditando(false);
          }}
          onCancelar={() => setEditando(false)}
        />
      )}
    </>
  );
  return (
    <CelulaDaFaixa
      rotulo={
        <>
          Pedidos<span className="max-md:hidden"> anotados</span> hoje
        </>
      }
      valor={ordersOk ? brl.format(pedidos.valor) : "—"}
      legenda={legenda}
    />
  );
}

/** "atualizado há N min" e o botão de atualizar; no celular, só "há N min" (a recarga do minuto segue sozinha). */
function Atualizado({ geradoEm, agora, onAtualizar }: { geradoEm: string | null; agora: Date; onAtualizar: () => void }) {
  return (
    <div className="col-start-2 row-start-1 flex items-center gap-1.5 pr-4 text-13 text-slate-600 md:pr-3 min-[87.5rem]:flex-none min-[87.5rem]:pl-6 min-[87.5rem]:pr-0">
      <p className="whitespace-nowrap">
        <span className="max-md:hidden">{geradoEm ? "atualizado " : "a série "}</span>
        {geradoEm ? haQuanto(geradoEm, agora) : "não carregou"}
      </p>
      <button type="button" onClick={onAtualizar} aria-label="Atualizar agora" title="Atualizar agora" className={BOTAO_ATUALIZAR}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
