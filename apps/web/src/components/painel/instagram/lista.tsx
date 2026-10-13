"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useCasca } from "@/components/painel/casca-context";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { TETO_RUNS_POR_HORA } from "@/lib/ig/limites";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import type { FlowSummary } from "@/lib/stores/ig-flows";
import { ChipEstado } from "./chip-estado";
import { ContaDoInstagram } from "./conta";
import { OfertaInstagram } from "./oferta";

type Resposta = { flows: FlowSummary[] };
const valida = (corpo: unknown): corpo is Resposta => !!corpo && typeof corpo === "object" && Array.isArray((corpo as Resposta).flows);

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

export function InstagramVitrine() {
  const { instagram, recarregarInstagram } = useCasca();
  const [fluxos, setFluxos] = useState<FlowSummary[]>([]);
  const [carga, setCarga] = useState<Carga>("carregando");
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const toast = useToast();

  const carregar = useCallback(() => buscar<Resposta>("/api/ig/flows", valida, (r) => setFluxos(r.flows), setCarga), []);
  useEffect(() => {
    if (instagram?.enabled) void carregar();
  }, [instagram?.enabled, carregar]);

  if (instagram === null) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <span role="status" aria-label="Carregando Instagram" className="pn-skeleton block h-7 w-40 rounded-[var(--radius-chip)]" />
      </section>
    );
  }

  if (!instagram.enabled) {
    return (
      <Suspense fallback={null}>
        <OfertaInstagram />
      </Suspense>
    );
  }

  const apagar = async (f: FlowSummary) => {
    const ok = await pedirConfirmacao({ titulo: `Apagar “${f.name}”?`, texto: "O rascunho e o histórico deste fluxo somem. Não dá pra desfazer.", rotulo: "Apagar", destrutivo: true });
    if (!ok) return;
    // assertPermission devolve 403 em texto puro: só o status importa aqui, o corpo nunca é lido como JSON.
    const r = await fetch(`/api/ig/flows/${f.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      toast("Não deu pra apagar. Tente de novo.", "error");
      return;
    }
    setFluxos((lista) => lista.filter((x) => x.id !== f.id));
    recarregarInstagram();
  };

  return (
    <section className="px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
          <p className="mt-1 text-13 text-slate-600">Fluxos que respondem comentário e direct com o convite do grupo.</p>
          {/* Suspense: `useSearchParams` sem ele derruba o pré-render da página. */}
          <div className="mt-2">
            <Suspense fallback={null}>
              <ContaDoInstagram />
            </Suspense>
          </div>
          {instagram.startedLastHour >= TETO_RUNS_POR_HORA && (
            <p role="status" className="mt-2 text-13 font-medium text-warning-700">
              Teto de {TETO_RUNS_POR_HORA} pessoas por hora atingido. Quem comentar agora fica sem direct até a hora virar.
            </p>
          )}
        </div>
        <Link href="/painel/instagram/novo" className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100">
          Novo fluxo
        </Link>
      </header>

      <div className="mt-5 rounded-[10px] border border-line-200 bg-paper-0">
        {carga === "carregando" && <span role="status" aria-label="Carregando fluxos" className="pn-skeleton m-5 block h-5 w-64 rounded-[var(--radius-chip)]" />}
        {carga === "erro" && (
          <p className="px-5 py-8 text-center text-13 text-slate-600">
            Não deu pra carregar os fluxos.{" "}
            <button type="button" onClick={() => void carregar()} className="text-cobalt-500">Tentar de novo</button>
          </p>
        )}
        {carga === "ok" && fluxos.length === 0 && (
          <p className="px-5 py-8 text-center text-13 text-slate-600">Nenhum fluxo ainda. Comece por uma receita pronta em “Novo fluxo”.</p>
        )}
        {carga === "ok" && fluxos.length > 0 && (
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-line-200 text-left text-12 text-slate-600">
                <th scope="col" className="px-5 py-2.5 font-medium">Fluxo</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Gatilho</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Estado</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Atualizado</th>
                <th scope="col" className="px-5 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {fluxos.map((f) => (
                <tr key={f.id} className="border-b border-line-200 last:border-0 hover:bg-hover-ficha">
                  <td className="px-5 py-3">
                    <Link href={`/painel/instagram/${f.id}`} className="font-medium text-volt-950">{f.name}</Link>
                  </td>
                  <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">{RECIPES[f.recipe]?.gatilho ?? "—"}</td>
                  <td className="px-3 py-3"><ChipEstado status={f.status} /></td>
                  <td className="hidden px-3 py-3 font-data tabular-nums text-slate-600 sm:table-cell">{dataCurta(f.updated_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" aria-label={`Apagar ${f.name}`} onClick={() => void apagar(f)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:text-danger-700">
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {folhaDeConfirmacao}
    </section>
  );
}
