"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { Campanha } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import { barrasDaAtividade, somaMedida, type AtividadeDaCampanha } from "@/lib/painel/atividade";
import {
  celulasDoFiltro,
  lugaresDosBlocos,
  montarMapa,
  novoDoBloco,
  resumoDoBloco,
  type AlertaDoMapa,
  type BlocoDoMapa,
  type CelulaDoMapa,
  type FiltroDoMapa,
  type LugarDoBloco,
} from "@/lib/painel/ao-vivo/mapa";
import type { EstadoNaCampanha } from "@/lib/painel/campanha-visao";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { CelulaDoGrupo } from "./celula-do-grupo";

const FILTROS: [FiltroDoMapa, string][] = [
  ["todos", "Todos"],
  ["cheio", "Lotou"],
  ["quase", "Quase"],
  ["ativo", "Ativo"],
  ["sem_convite", "Sem convite"],
  ["sumiu", "Sumiu"],
];

/**
 * O selo de cada filtro na cor do estado (spec G2, decisão 7): os filtros são a legenda do mapa. `pn-chip` é o
 * chip de estado de 12 px, a exceção da decisão 3. Acid só no LOTOU (decisão 11), e no `span`: o botão nunca leva
 * a cor Acid (regra 10). Mesmo desenho do `SELO` da campanha (`visao-geral.tsx`), menos o "sem convite", que aqui
 * é o fio vermelho da célula, como a spec pede.
 */
const SELO: Record<EstadoNaCampanha, string> = {
  cheio: "pn-chip--acid",
  quase: "bg-aviso-fundo text-warning-700",
  ativo: "",
  sem_convite: "border border-saida bg-paper-0 text-saida",
  sumiu: "pn-chip--line",
};

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const BOTAO_DO_CELULAR = `flex min-h-11 w-full min-w-0 items-center justify-center rounded-[var(--radius-control)] border border-line-200 px-3 text-center text-[14px] font-medium text-volt-950 ${FOCO}`;
// 44 px de alvo no celular (regra 4 da Vitrine); 32 px a partir de 768 px, como no mockup.
const BOTAO_DO_ALERTA = `inline-flex h-8 shrink-0 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-semibold text-volt-950 hover:bg-hover-ficha max-md:h-11 ${FOCO}`;

/** Só a campanha com slug tem tela de configuração; "/painel/campanhas" e "Outros grupos" não. */
const linkDaCampanha = (href: string) => href.startsWith("/painel/campanhas/") && href !== "/painel/campanhas";

type Props = { grupos: Group[]; campanhas: Campanha[]; atividade: AtividadeDaCampanha | null };

/** O mapa dos grupos da Início "Ao vivo" (spec G2 2026-10-05, decisão 7): onde está entrando gente e o que lotou. */
export function MapaDosGrupos({ grupos, campanhas, atividade }: Props) {
  const [filtro, setFiltro] = useState<FiltroDoMapa>("todos");
  const mapa = useMemo(
    () =>
      montarMapa({
        grupos,
        campanhas,
        hojePorGrupo: atividade?.hojePorGrupo ?? {},
        abertosHoje: atividade?.gruposAbertosHoje ?? [],
      }),
    [grupos, campanhas, atividade],
  );
  const filtros = FILTROS.filter(([f]) => f !== "sumiu" || mapa.contagens.sumiu > 0);
  // O filtro escolhido some da lista quando a recarga zera o número (ex.: "Sumiu"): volta para "Todos".
  const [ativo, rotuloDoAtivo] = filtros.find(([f]) => f === filtro) ?? filtros[0];
  // E o estado acompanha: senão um "Sumiu" guardado voltaria a filtrar sozinho na recarga seguinte.
  if (filtro !== ativo) setFiltro(ativo);
  const total = mapa.contagens.todos;

  return (
    <section
      data-testid="inicio-mapa"
      aria-labelledby="mapa-titulo"
      className="rounded-[10px] border border-line-200 bg-paper-0 max-md:-mx-4 max-md:rounded-none max-md:border-x-0"
    >
      <Cabecalho grupos={grupos} total={total} atividade={atividade} />
      {total === 0 ? (
        <SemGrupos />
      ) : (
        <>
          <Filtros filtros={filtros} ativo={ativo} contagens={mapa.contagens} onEscolher={setFiltro} />
          <Blocos blocos={mapa.blocos} filtro={ativo} rotulo={rotuloDoAtivo} />
          {/* Só no celular (zona do polegar); a partir de 768 px o atalho é o "Todos os grupos" do cabeçalho. */}
          <div className="px-4 pb-4 md:hidden">
            <Link href="/painel/grupos" className={BOTAO_DO_CELULAR}>
              {total === 1 ? "Ver o grupo" : `Ver os ${numero(total)} grupos`}
            </Link>
          </div>
          <Alertas alertas={mapa.alertas} />
        </>
      )}
    </section>
  );
}

type PropsDoCabecalho = { grupos: Group[]; total: number; atividade: AtividadeDaCampanha | null };

/** "58 grupos · 42.368 pessoas · +214 hoje" e o atalho "Todos os grupos" (no celular o atalho é o botão de baixo). */
function Cabecalho({ grupos, total, atividade }: PropsDoCabecalho) {
  const pessoas = grupos.reduce((s, g) => s + (Number.isFinite(g.members) ? g.members : 0), 0);
  // A mesma conta do "Entraram hoje" da faixa e do gráfico: o número bate nos três lugares.
  const hoje = atividade ? somaMedida(barrasDaAtividade(atividade, "hoje", "entraram")).entraram : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-200 px-4 py-3 md:px-5">
      <h2 id="mapa-titulo" className="text-[16px] font-semibold text-volt-950">
        Mapa dos grupos
      </h2>
      {total > 0 && (
        <p className="text-13 tabular-nums text-slate-600">
          {numero(total)} {total === 1 ? "grupo" : "grupos"} · {numero(pessoas)} pessoas
          {hoje > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-serie">+{numero(hoje)} hoje</span>
            </>
          )}
        </p>
      )}
      {total > 0 && (
        <Link href="/painel/grupos" className={`ml-auto text-13 font-semibold text-cobalt-500 hover:underline max-md:hidden ${FOCO}`}>
          Todos os grupos
        </Link>
      )}
    </div>
  );
}

function SemGrupos() {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-15 font-semibold text-volt-950">Nenhum grupo ainda</p>
      <p className="mt-1 text-13 text-slate-600">Crie ou importe seus grupos do WhatsApp para vê-los aqui.</p>
      <Link href="/painel/grupos" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
        Ir para Grupos
      </Link>
    </div>
  );
}

type PropsDosFiltros = {
  filtros: [FiltroDoMapa, string][];
  ativo: FiltroDoMapa;
  contagens: Record<FiltroDoMapa, number>;
  onEscolher: (f: FiltroDoMapa) => void;
};

/** Os filtros com o selo na cor do estado e a contagem. No celular rolam de lado. */
function Filtros({ filtros, ativo, contagens, onEscolher }: PropsDosFiltros) {
  return (
    <div role="group" aria-label="Filtrar grupos" className="flex gap-1.5 overflow-x-auto border-b border-line-200 px-4 py-2.5 [scrollbar-width:none] md:flex-wrap md:px-5">
      {filtros.map(([f, rotulo]) => (
        <button
          key={f}
          type="button"
          aria-pressed={ativo === f}
          onClick={() => onEscolher(f)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border px-2 text-13 font-semibold transition-colors max-md:h-11",
            FOCO,
            ativo === f ? "border-slate-600 bg-porta-ativa text-volt-950" : "border-line-200 bg-paper-0 text-slate-600 hover:text-volt-950",
          )}
        >
          {f === "todos" ? rotulo : <span className={cn("pn-chip", SELO[f])}>{rotulo}</span>}{" "}
          <span className="tabular-nums">{numero(contagens[f])}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * As campanhas (a maior primeiro: `montarMapa` ordena). Abaixo de 768 px um bloco embaixo do outro, cada um com as
 * dez colunas. A partir daí, a grade de 10 colunas de `lugaresDosBlocos`: as linhas dela vão em pares (cabeçalho,
 * células) e cada bloco é um subgrid do seu par, para dois blocos lado a lado começarem as células na mesma altura
 * mesmo quando um cabeçalho quebra linha.
 */
function Blocos({ blocos, filtro, rotulo }: { blocos: BlocoDoMapa[]; filtro: FiltroDoMapa; rotulo: string }) {
  const visiveis = blocos.map((b) => ({ bloco: b, ...celulasDoFiltro(b, filtro) })).filter((v) => v.celulas.length > 0);
  if (visiveis.length === 0) {
    return <p className="px-4 py-4 text-13 text-slate-600 md:px-5">Nenhum grupo em &quot;{rotulo}&quot;.</p>;
  }
  const lugares = lugaresDosBlocos(visiveis.map((v) => v.celulas.length));
  return (
    <div className="flex flex-col gap-5 p-4 md:grid md:grid-cols-10 md:gap-x-1 md:gap-y-0 md:px-5 md:pb-0">
      {visiveis.map((v, i) => (
        <BlocoNoMapa key={v.bloco.chave} {...v} lugar={lugares[i]} />
      ))}
    </div>
  );
}

type PropsDoBloco = { bloco: BlocoDoMapa; celulas: CelulaDoMapa[]; ocultos: number; lugar: LugarDoBloco };

/** Uma campanha: o cabeçalho, as células e as notas "novo HH:MM" e "mostrando os N mais cheios". */
function BlocoNoMapa({ bloco: b, celulas, ocultos, lugar }: PropsDoBloco) {
  const novo = novoDoBloco(celulas);
  return (
    <div
      // grid-area = linha de cima do par / coluna / as duas linhas do par / as colunas do bloco. Só vale a partir de 768 px.
      style={{
        ["--lugar" as string]: `${2 * lugar.linha - 1} / ${lugar.coluna} / span 2 / span ${lugar.largura}`,
        ["--colunas" as string]: lugar.largura,
      }}
      // A coluna única do subgrid com min 0: um título sem espaço não alarga o bloco por cima do vizinho.
      className="flex min-w-0 flex-col md:grid md:grid-cols-[minmax(0,1fr)] md:grid-rows-subgrid md:[grid-area:var(--lugar)]"
    >
      <CabecalhoDoBloco bloco={b} />
      <div className="md:pb-5">
        <ul className="grid grid-cols-10 gap-[3px] md:gap-1 md:[grid-template-columns:repeat(var(--colunas),minmax(0,1fr))]">
          {celulas.map((c) => (
            <li key={c.id} className="min-w-0">
              <CelulaDoGrupo celula={c} bloco={b.titulo} />
            </li>
          ))}
        </ul>
        {novo && (
          <p className="mt-2 text-13 text-slate-600">
            <b className="font-semibold text-volt-950">novo {novo.hora}</b> · o link já leva pro {novo.rotulo}
          </p>
        )}
        {ocultos > 0 && (
          <p className="mt-2 text-13 text-slate-600">
            mostrando os {celulas.filter((c) => c.estado !== "sumiu").length} mais cheios ·{" "}
            <Link href={b.href} className="font-semibold text-cobalt-500 hover:underline">
              ver todos os {numero(celulas.length + ocultos)}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/** "40 grupos · 95% das vagas · +171 hoje" e o "abre o próximo sozinho". O título quebra em qualquer ponto se não couber. */
function CabecalhoDoBloco({ bloco: b }: { bloco: BlocoDoMapa }) {
  const resumo = resumoDoBloco(b);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pb-2.5">
      <h3 className="text-[14px] font-semibold text-volt-950 [overflow-wrap:anywhere]">
        <Link href={b.href} className="hover:underline">
          {b.titulo}
        </Link>
      </h3>
      <p className="text-13 tabular-nums text-slate-600">
        {numero(resumo.grupos)} {resumo.grupos === 1 ? "grupo" : "grupos"}
        {resumo.pctDasVagas !== null && <> · {resumo.pctDasVagas}% das vagas</>}
        {resumo.entraramHoje > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-serie">+{numero(resumo.entraramHoje)} hoje</span>
          </>
        )}
      </p>
      {b.autoGrow && <AbreSozinho href={b.href} />}
    </div>
  );
}

/**
 * "✓ abre o próximo sozinho": só com o "Lotou → abre outro" ligado (spec G2, decisão 7). Desligado não diz nada:
 * quando todos lotam, o alerta do rodapé avisa.
 */
function AbreSozinho({ href }: { href: string }) {
  const texto = (
    <>
      <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
      abre o próximo sozinho
    </>
  );
  return (
    <p className="text-13 text-slate-600 md:ml-auto">
      {linkDaCampanha(href) ? (
        <Link href={`${href}/editar`} className="hover:underline">
          {texto}
        </Link>
      ) : (
        texto
      )}
    </p>
  );
}

/** Rodapé de alerta (spec G2, decisão 7): o que precisa de ação, com o botão que leva até ela (é navegação: `a`). */
function Alertas({ alertas }: { alertas: AlertaDoMapa[] }) {
  if (alertas.length === 0) return null;
  return (
    <ul>
      {alertas.map((a) => (
        <li key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-200 px-4 py-3 md:px-5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-13 text-volt-950">{a.texto}</p>
          <Link href={a.acao.href} className={BOTAO_DO_ALERTA}>
            {a.acao.rotulo}
          </Link>
        </li>
      ))}
    </ul>
  );
}
