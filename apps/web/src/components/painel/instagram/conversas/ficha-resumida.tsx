"use client";

import Link from "next/link";
import React, { useState } from "react";
import { fieldLabel } from "@/lib/ig/flow/names";
import type { FichaDaPessoa } from "@/lib/ig/pessoas-tipos";
import { ChipsEtiqueta } from "../chips-etiqueta";
import { dataCurta, dataDoDia } from "../pessoas/datas";
import type { CargaDaFicha } from "./use-ficha";

const ESTADO = { queued: "na fila", active: "esperando", done: "enviado", stopped: "parado", failed: "falhou" } as const;
const MAX_ATENDIMENTOS = 3;

type Props = {
  quem: string;
  carga: CargaDaFicha;
  ficha: FichaDaPessoa | null;
  aoEditarEtiquetas: (add: string[], remove: string[]) => Promise<string | null>;
  aoTentarDeNovo: () => void;
};

/** Ficha resumida ao lado da conversa: campos, etiquetas e os últimos fluxos. A completa mora em Pessoas. */
export function FichaResumida({ quem, carga, ficha, aoEditarEtiquetas, aoTentarDeNovo }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const p = ficha?.pessoa;

  const mudarEtiquetas = async (lista: string[]) => {
    if (!p) return;
    setErro(await aoEditarEtiquetas(lista.filter((t) => !p.tags.includes(t)), p.tags.filter((t) => !lista.includes(t))));
  };

  return (
    <aside aria-label={`Ficha de ${quem}`} className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-14 font-semibold text-volt-950">Ficha</h3>
        <Link href="/painel/instagram/pessoas" className="text-13 text-cobalt-500">Abrir ficha completa</Link>
      </div>

      {carga === "carregando" && <span role="status" aria-label="Carregando ficha" className="pn-skeleton block h-5 w-40 rounded-[var(--radius-chip)]" />}
      {carga === "erro" && (
        <p role="alert" className="text-13 text-slate-600">
          Não deu pra carregar a ficha. <button type="button" onClick={aoTentarDeNovo} className="text-cobalt-500">Tentar de novo</button>
        </p>
      )}
      {carga === "sem-acesso" && <p className="text-13 text-slate-600">Você não tem acesso às fichas.</p>}
      {carga === "sem-ficha" && <p className="text-13 text-slate-600">Esta pessoa ainda não tem ficha.</p>}

      {p && ficha && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-13">
            {Object.keys(p.fields).length === 0 && <dd className="col-span-2 text-slate-600">Nenhum campo guardado.</dd>}
            {Object.entries(p.fields).map(([chave, valor]) => (
              <div key={chave} className="contents">
                <dt className="text-slate-600">{fieldLabel(chave)}</dt>
                <dd className="text-volt-950 [overflow-wrap:anywhere]">{String(valor)}</dd>
              </div>
            ))}
          </dl>

          <section aria-label="Etiquetas">
            <h4 className="mb-1.5 text-12 font-medium text-slate-600">Etiquetas</h4>
            <ChipsEtiqueta etiquetas={p.tags} aoMudar={(l) => void mudarEtiquetas(l)} rotulo="Nova etiqueta" />
            {erro && <p role="alert" className="mt-1 text-12 text-danger-700">{erro}</p>}
          </section>

          <section aria-label="Fluxos">
            <h4 className="mb-1.5 text-12 font-medium text-slate-600">Fluxos</h4>
            {ficha.atendimentos.length === 0 && <p className="text-13 text-slate-600">Nenhum atendimento nos últimos 90 dias.</p>}
            <ul className="flex flex-col gap-1">
              {ficha.atendimentos.slice(0, MAX_ATENDIMENTOS).map((a) => (
                <li key={a.id} className="text-13 text-volt-950">
                  {a.flowName ?? "Fluxo apagado"} <span className="text-12 text-slate-600">· {dataCurta(a.startedAt)}, {ESTADO[a.status]}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-12 text-slate-600">
            Primeira conversa em {dataDoDia(p.firstSeenAt)}. A conversa inteira continua no Instagram da loja; aqui você responde sem sair do painel.
          </p>
        </>
      )}
    </aside>
  );
}
