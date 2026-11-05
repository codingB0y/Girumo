"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { normalizeTag } from "@/lib/ig/flow/names";
import { horaDaLista, iniciais, type FiltroDaLista } from "@/lib/ig/conversas/tela";
import type { ConversaDto } from "@/lib/ig/conversas/tipos";
import { cn } from "@/lib/utils";
import type { CargaDaLista, Varredura } from "./use-conversas";

const FILTROS = [
  { id: "open", rotulo: "Abertas" },
  { id: "waiting", rotulo: "Aguardando você" },
  { id: "unread", rotulo: "Não lidas" },
  { id: "resolved", rotulo: "Resolvidas" },
] as const;
type IdDoFiltro = (typeof FILTROS)[number]["id"];

const ativo = (f: FiltroDaLista, id: IdDoFiltro): boolean => (id === "unread" ? f.naoLidas === true : f.status === id);
/** Um filtro de cada vez, como no mockup; tocar no que está ligado desliga. */
const alternar = (f: FiltroDaLista, id: IdDoFiltro): FiltroDaLista => {
  const resto: FiltroDaLista = { busca: f.busca, etiqueta: f.etiqueta };
  if (ativo(f, id)) return resto;
  return id === "unread" ? { ...resto, naoLidas: true } : { ...resto, status: id };
};

const AVISO_DA_VARREDURA: Partial<Record<Varredura["estado"], string>> = {
  rodando: "Importando as conversas do Instagram…",
  cedo: "A lista foi atualizada há pouco. Tente de novo em instantes.",
  "sem-conta": "A conta do Instagram não está conectada.",
  erro: "Não deu pra importar agora. Tente de novo.",
};

type Props = {
  itens: ConversaDto[];
  abertaId: string | null;
  filtro: FiltroDaLista;
  aguardando: number;
  etiquetaParcial: boolean;
  carga: CargaDaLista;
  maisFalhou: boolean;
  temMais: boolean;
  varredura: Varredura;
  aoMudarFiltro: (f: FiltroDaLista) => void;
  aoAbrir: (id: string) => void;
  aoVerMais: () => void;
  aoAtualizar: () => void;
  aoTentarDeNovo: () => void;
};

function Linha({ c, atual, agora, aoAbrir }: { c: ConversaDto; atual: boolean; agora: Date; aoAbrir: (id: string) => void }) {
  const quem = c.username ? `@${c.username}` : (c.nome ?? "Sem @");
  const resumo = `${quem}${c.naoLidas ? `, ${c.naoLidas} não lida${c.naoLidas === 1 ? "" : "s"}` : ""}${c.situacao === "waiting" ? ", aguardando você" : ""}`;
  return (
    <li>
      <button type="button" onClick={() => aoAbrir(c.id)} aria-current={atual ? "true" : undefined} aria-label={resumo} className={cn("flex min-h-16 w-full gap-3 border-b border-line-200 px-3.5 py-3 text-left hover:bg-canvas-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cobalt-500", atual && "bg-canvas-100")}>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-line-200 text-13 font-bold text-volt-950">{iniciais(c.username, c.nome)}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-14 text-volt-950", c.naoLidas > 0 ? "font-semibold" : "font-medium")}>{quem}</span>
            <time dateTime={c.ultimaEm ?? undefined} className="shrink-0 text-12 text-slate-600">{horaDaLista(c.ultimaEm, agora)}</time>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-13 text-slate-600">{c.previa ?? "Sem mensagens"}</span>
            {c.naoLidas > 0 && <span aria-hidden="true" className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cobalt-500 px-1.5 text-12 font-semibold text-paper-0">{c.naoLidas}</span>}
          </span>
          {(c.situacao === "waiting" || c.pedido || c.roboPausadoAte) && (
            <span className="flex flex-wrap gap-1.5">
              {c.situacao === "waiting" && <span className="inline-flex h-5 items-center rounded bg-canvas-100 px-1.5 text-12 font-semibold text-warning-700">Aguardando você</span>}
              {c.roboPausadoAte && <span className="inline-flex h-5 items-center rounded bg-canvas-100 px-1.5 text-12 text-slate-600">Robô pausado</span>}
              {c.pedido && <span className="inline-flex h-5 items-center rounded bg-canvas-100 px-1.5 text-12 text-slate-600">Pedido de mensagem</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Coluna da esquerda: busca por @, filtros, etiqueta e as conversas do índice. */
export function ListaDeConversas(p: Props) {
  const [etiqueta, setEtiqueta] = useState(p.filtro.etiqueta);
  const [etiquetaRecusada, setEtiquetaRecusada] = useState(false);
  const agora = new Date();
  const aviso = AVISO_DA_VARREDURA[p.varredura.estado];

  const aplicarEtiqueta = () => {
    if (!etiqueta.trim()) return p.aoMudarFiltro({ ...p.filtro, etiqueta: "" });
    const tag = normalizeTag(etiqueta);
    setEtiquetaRecusada(tag === null);
    if (tag !== null) {
      setEtiqueta(tag);
      p.aoMudarFiltro({ ...p.filtro, etiqueta: tag });
    }
  };

  return (
    <section aria-label="Lista de conversas" className="flex min-h-0 flex-col border-line-200 bg-paper-0 lg:border-r">
      <div className="flex flex-col gap-2.5 border-b border-line-200 p-3">
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <span className="sr-only">Buscar por @</span>
          <input type="search" value={p.filtro.busca} onChange={(e) => p.aoMudarFiltro({ ...p.filtro, busca: e.target.value })} placeholder="Buscar por @" maxLength={60} className="h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 pl-8 pr-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 lg:h-9 lg:text-13" />
        </label>
        <div role="group" aria-label="Filtrar conversas" className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={ativo(p.filtro, f.id)} onClick={() => p.aoMudarFiltro(alternar(p.filtro, f.id))} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-13 lg:min-h-8", ativo(p.filtro, f.id) ? "border-volt-950 bg-volt-950 text-canvas-100" : "border-line-200 bg-paper-0 text-volt-950")}>
              {f.rotulo}
              {f.id === "waiting" && p.aguardando > 0 && <span className="font-data tabular-nums">{p.aguardando}</span>}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-12 text-slate-600">Etiqueta</span>
          <input
            value={etiqueta}
            onChange={(e) => {
              setEtiqueta(e.target.value);
              setEtiquetaRecusada(false);
            }}
            onBlur={aplicarEtiqueta}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), aplicarEtiqueta())}
            placeholder="ex.: quer-infantil"
            maxLength={80}
            className="h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 lg:h-9 lg:text-13"
          />
        </label>
        {etiquetaRecusada && <p role="alert" className="text-12 text-warning-700">Use letras e números. Espaço vira hífen.</p>}
        {p.etiquetaParcial && <p role="status" className="text-12 text-slate-600">Mostrando só as pessoas mais recentes com esta etiqueta.</p>}
      </div>

      <nav aria-label="Conversas" className="min-h-0 flex-1 overflow-y-auto">
        {p.carga === "carregando" && p.itens.length === 0 && <span role="status" aria-label="Carregando conversas" className="pn-skeleton m-4 block h-5 w-48 rounded-[var(--radius-chip)]" />}
        {p.carga === "erro" && (
          <p role="alert" className="px-4 py-6 text-center text-13 text-slate-600">
            Não deu pra carregar as conversas. <button type="button" onClick={p.aoTentarDeNovo} className="text-cobalt-500">Tentar de novo</button>
          </p>
        )}
        {p.carga === "sem-acesso" && <p role="alert" className="px-4 py-6 text-center text-13 text-slate-600">Você não tem acesso às conversas.</p>}
        {p.carga === "ok" && p.itens.length === 0 && p.varredura.estado !== "rodando" && (
          <p role="status" className="px-4 py-6 text-center text-13 text-slate-600">
            {p.filtro.busca || p.filtro.etiqueta || p.filtro.status || p.filtro.naoLidas ? "Nenhuma conversa com esses filtros." : "Nenhuma conversa ainda. Quando alguém mandar direct, aparece aqui."}
          </p>
        )}
        {p.itens.length > 0 && (
          <ul>
            {p.itens.map((c) => (
              <Linha key={c.id} c={c} atual={c.id === p.abertaId} agora={agora} aoAbrir={p.aoAbrir} />
            ))}
          </ul>
        )}
        {p.temMais && (
          <div className="p-3 text-center">
            {p.maisFalhou && <p role="alert" className="mb-1 text-12 text-danger-700">Não deu pra carregar mais.</p>}
            <button type="button" onClick={p.aoVerMais} className="min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 lg:min-h-9">Ver mais conversas</button>
          </div>
        )}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-200 px-3 py-2">
        <p role="status" className="min-w-0 flex-1 text-12 text-slate-600">
          {aviso ?? (p.varredura.estado === "feita" ? `Lista atualizada${p.varredura.novas ? `: ${p.varredura.novas} novas` : ""}${p.varredura.parcial ? ". Havia mais; toque em Atualizar para continuar" : ""}.` : "")}
        </p>
        <button type="button" onClick={p.aoAtualizar} disabled={p.varredura.estado === "rodando"} className="min-h-11 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9">
          {p.varredura.estado === "rodando" ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
    </section>
  );
}
