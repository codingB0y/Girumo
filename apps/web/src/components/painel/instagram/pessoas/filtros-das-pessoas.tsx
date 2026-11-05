"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fieldLabel } from "@/lib/ig/flow/names";
import type { ContactStats } from "@/lib/stores/ig-contacts";
import { lerJson, SEM_FILTRO, type Filtros, type Recencia } from "./use-pessoas";

const RECENCIAS: Array<{ valor: Recencia; rotulo: string }> = [
  { valor: "tudo", rotulo: "Qualquer data" },
  { valor: "24h", rotulo: "Últimas 24 horas" },
  { valor: "7d", rotulo: "Últimos 7 dias" },
  { valor: "30d", rotulo: "Últimos 30 dias" },
];

const CONTROLE = "h-9 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2 text-13 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const DEBOUNCE_MS = 300;

type Props = { filtros: Filtros; stats: ContactStats | null; aoMudar: (f: Filtros) => void };

/** Busca por @, etiquetas ("tem todas"), campo = valor e última conversa. Os filtros combinam. */
export function FiltrosDasPessoas({ filtros, stats, aoMudar }: Props) {
  const [busca, setBusca] = useState(filtros.q);
  const [valores, setValores] = useState<Array<{ valor: string; pessoas: number }>>([]);

  // A busca espera o dedo parar: cada letra não vira uma ida ao banco.
  useEffect(() => {
    if (busca === filtros.q) return;
    const t = setTimeout(() => aoMudar({ ...filtros, q: busca }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [busca, filtros, aoMudar]);

  // Valores que existem na loja para o campo escolhido (com a contagem de cada).
  useEffect(() => {
    if (!filtros.campo) return;
    let vivo = true;
    void lerJson<{ valores: Array<{ valor: string; pessoas: number }> }>(`/api/ig/contacts/fields/${filtros.campo}`).then((r) => {
      if (vivo) setValores(r.ok ? r.dados.valores : []);
    });
    return () => {
      vivo = false;
    };
  }, [filtros.campo]);

  const etiquetasLivres = (stats?.etiquetas ?? []).filter((e) => !filtros.tags.includes(e.etiqueta));
  const ativo = filtros.q !== "" || filtros.tags.length > 0 || filtros.campo !== "" || filtros.recencia !== "tudo";

  return (
    <section aria-label="Filtros" className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-12 text-slate-600">
        Buscar por @
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="@usuario" maxLength={60} className={`${CONTROLE} w-44`} />
      </label>

      <label className="flex flex-col gap-1 text-12 text-slate-600">
        Etiqueta (tem todas)
        <select
          value=""
          onChange={(e) => e.target.value && aoMudar({ ...filtros, tags: [...filtros.tags, e.target.value] })}
          disabled={etiquetasLivres.length === 0}
          className={`${CONTROLE} w-40`}
        >
          <option value="">{etiquetasLivres.length === 0 ? "Sem etiquetas" : "Adicionar…"}</option>
          {etiquetasLivres.map((e) => (
            <option key={e.etiqueta} value={e.etiqueta}>{e.etiqueta} ({e.pessoas})</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-12 text-slate-600">
        Campo
        <select value={filtros.campo} onChange={(e) => aoMudar({ ...filtros, campo: e.target.value, valor: "" })} disabled={!stats?.campos.length} className={`${CONTROLE} w-40`}>
          <option value="">{stats?.campos.length ? "Qualquer" : "Sem campos"}</option>
          {(stats?.campos ?? []).map((c) => (
            <option key={c.campo} value={c.campo}>{fieldLabel(c.campo)} ({c.pessoas})</option>
          ))}
        </select>
      </label>

      {filtros.campo && (
        <label className="flex flex-col gap-1 text-12 text-slate-600">
          Valor
          <select value={filtros.valor} onChange={(e) => aoMudar({ ...filtros, valor: e.target.value })} className={`${CONTROLE} w-40`}>
            <option value="">Escolha…</option>
            {valores.map((v) => (
              <option key={v.valor} value={v.valor}>{v.valor} ({v.pessoas})</option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-12 text-slate-600">
        Última conversa
        <select value={filtros.recencia} onChange={(e) => aoMudar({ ...filtros, recencia: e.target.value as Recencia })} className={`${CONTROLE} w-44`}>
          {RECENCIAS.map((r) => (
            <option key={r.valor} value={r.valor}>{r.rotulo}</option>
          ))}
        </select>
      </label>

      {ativo && (
        <button type="button" onClick={() => { setBusca(""); aoMudar(SEM_FILTRO); }} className="h-9 px-1 text-13 text-cobalt-500">
          Limpar filtros
        </button>
      )}

      {filtros.tags.length > 0 && (
        <ul aria-label="Etiquetas filtradas" className="flex w-full flex-wrap gap-1.5">
          {filtros.tags.map((t) => (
            <li key={t} className="pn-chip gap-1">
              {t}
              <button type="button" aria-label={`Tirar o filtro ${t}`} onClick={() => aoMudar({ ...filtros, tags: filtros.tags.filter((x) => x !== t) })}>
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
