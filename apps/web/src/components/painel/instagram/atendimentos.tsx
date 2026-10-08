"use client";

import { useCallback, useEffect, useState } from "react";
import type { Atendimento } from "@/app/api/ig/flows/[id]/runs/route";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";

type Resposta = { runs: Atendimento[] };
const valida = (corpo: unknown): corpo is Resposta => !!corpo && typeof corpo === "object" && Array.isArray((corpo as Resposta).runs);

const ORIGEM: Record<Atendimento["sourceKind"], string> = { comment: "Comentário", dm: "Direct", story: "Story" };
const ESTADO: Record<Atendimento["status"], string> = { queued: "Na fila", active: "Esperando", done: "Enviado", stopped: "Parado", failed: "Falhou" };

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Quem chamou neste fluxo, do mais recente. Só o que o banco guarda: @, origem, palavra, estado. */
export function Atendimentos({ id }: { id: string }) {
  const [lista, setLista] = useState<Atendimento[]>([]);
  const [carga, setCarga] = useState<Carga>("carregando");
  const carregar = useCallback(() => buscar<Resposta>(`/api/ig/flows/${id}/runs`, valida, (r) => setLista(r.runs), setCarga), [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section aria-label="Atendimentos" className="rounded-[10px] border border-line-200 bg-paper-0">
      {carga === "carregando" && <span role="status" aria-label="Carregando atendimentos" className="pn-skeleton m-5 block h-5 w-64 rounded-[var(--radius-chip)]" />}
      {carga === "erro" && (
        <p className="px-5 py-8 text-center text-13 text-slate-600">
          Não deu pra carregar os atendimentos.{" "}
          <button type="button" onClick={() => void carregar()} className="text-cobalt-500">Tentar de novo</button>
        </p>
      )}
      {carga === "ok" && lista.length === 0 && (
        <p className="px-5 py-8 text-center text-13 text-slate-600">Ninguém chamou ainda. Quando alguém comentar ou mandar a palavra, aparece aqui.</p>
      )}
      {carga === "ok" && lista.length > 0 && (
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-line-200 text-left text-12 text-slate-600">
              <th scope="col" className="px-5 py-2.5 font-medium">Pessoa</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Veio de</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Quando</th>
              <th scope="col" className="px-3 py-2.5 font-medium">O que aconteceu</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} className="border-b border-line-200 last:border-0">
                <td className="px-5 py-3 font-medium text-volt-950">{a.username ? `@${a.username}` : "Sem @"}</td>
                <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">
                  {ORIGEM[a.sourceKind]}
                  {a.matchedKeyword ? ` · “${a.matchedKeyword}”` : ""}
                </td>
                <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">{dataCurta(a.startedAt)}</td>
                <td className="px-3 py-3">
                  <span className={a.status === "failed" ? "text-danger-700" : a.status === "done" ? "text-success-700" : "text-slate-600"}>{a.semResposta ? "Sem resposta" : ESTADO[a.status]}</span>
                  {a.status === "failed" && a.errorText && <span className="block text-12 text-slate-600">{a.errorText}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
