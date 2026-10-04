"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Campanha } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { celulasDoFiltro, montarMapa, type FiltroDoMapa } from "@/lib/painel/ao-vivo/mapa";
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

const LEGENDA: [string, string][] = [
  ["bg-acid-500", "lotou"],
  ["bg-quase", "quase"],
  ["bg-slate-600", "com vaga"],
  ["border border-saida", "sem convite"],
  ["border border-dashed border-slate-600", "sumiu do cadastro"],
];

const textoAbreOutro = (ligado: boolean) => `Lotou → abre outro: ${ligado ? "ligado" : "desligado"}`;

/** Só a campanha com slug tem tela de configuração; "/painel/campanhas" e "Outros grupos" não. */
const linkDaCampanha = (href: string) => href.startsWith("/painel/campanhas/") && href !== "/painel/campanhas";

type Props = { grupos: Group[]; campanhas: Campanha[]; atividade: AtividadeDaCampanha | null };

/** O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02): onde está entrando gente e o que lotou. */
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
  const pessoas = grupos.reduce((s, g) => s + (Number.isFinite(g.members) ? g.members : 0), 0);

  return (
    <section data-testid="inicio-mapa" aria-labelledby="mapa-titulo" className="rounded-[10px] border border-line-200 bg-paper-0 max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-200 px-5 py-3">
        <h2 id="mapa-titulo" className="text-[16px] font-semibold text-volt-950">
          Mapa dos grupos
        </h2>
        {mapa.contagens.todos > 0 && (
          <p className="text-13 tabular-nums text-slate-600">
            {numero(grupos.length)} {grupos.length === 1 ? "grupo" : "grupos"} · {numero(pessoas)} pessoas
          </p>
        )}
        {mapa.contagens.todos > 0 && (
          <div role="group" aria-label="Filtrar grupos" className="flex w-full gap-1 overflow-x-auto sm:ml-auto sm:w-auto">
            {filtros.map(([f, rotulo]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={cn(
                  "h-8 shrink-0 rounded-md border px-2.5 text-13 transition-colors",
                  filtro === f ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950",
                )}
              >
                {rotulo} <span className="tabular-nums">{mapa.contagens[f]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {mapa.contagens.todos === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-15 font-semibold text-volt-950">Nenhum grupo ainda</p>
          <p className="mt-1 text-13 text-slate-600">Crie ou importe seus grupos do WhatsApp para vê-los aqui.</p>
          <Link href="/painel/grupos" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
            Ir para Grupos
          </Link>
        </div>
      ) : (
        <div className="space-y-5 px-5 py-4">
          {mapa.alertas.length > 0 && (
            <ul className="space-y-1.5">
              {mapa.alertas.map((a) => (
                <li key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-aviso-fundo px-3 py-2 text-13 text-volt-950">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{a.texto}</span>
                  <Link href={a.acao.href} className="font-semibold text-cobalt-500 hover:underline">
                    {a.acao.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {!mapa.blocos.some((b) => filtro === "todos" || b.todas.some((c) => c.estado === filtro)) && (
            <p className="text-13 text-slate-600">Nenhum grupo em &quot;{FILTROS.find(([f]) => f === filtro)?.[1]}&quot;.</p>
          )}

          {mapa.blocos.map((b) => {
            const { celulas, ocultos } = celulasDoFiltro(b, filtro);
            if (celulas.length === 0) return null;
            return (
              <div key={b.chave}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-13 font-semibold text-volt-950">
                    <Link href={b.href} className="hover:underline">
                      {b.titulo}
                    </Link>{" "}
                    <span className="font-normal tabular-nums text-slate-600">{b.todas.length}</span>
                  </h3>
                  {b.autoGrow !== null && (
                    <p className="text-12 text-slate-600">
                      {linkDaCampanha(b.href) ? (
                        <Link href={`${b.href}/editar`} className="hover:underline">
                          {textoAbreOutro(b.autoGrow)}
                        </Link>
                      ) : (
                        textoAbreOutro(b.autoGrow)
                      )}
                    </p>
                  )}
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {celulas.map((c) => (
                    <li key={c.id}>
                      <CelulaDoGrupo celula={c} bloco={b.titulo} />
                    </li>
                  ))}
                </ul>
                {ocultos > 0 && (
                  <p className="mt-2 text-12 text-slate-600">
                    mostrando os {celulas.filter((c) => c.estado !== "sumiu").length} mais cheios ·{" "}
                    <Link href={b.href} className="font-semibold text-cobalt-500 hover:underline">
                      ver todos os {numero(celulas.length + ocultos)}
                    </Link>
                  </p>
                )}
              </div>
            );
          })}

          <p className="flex flex-wrap gap-x-3 gap-y-1 text-12 text-slate-600">
            {LEGENDA.map(([cor, rotulo]) => (
              <span key={rotulo} className="inline-flex items-center gap-1">
                <span className={cn("h-2.5 w-2.5 rounded-[2px]", cor)} aria-hidden="true" />
                {rotulo}
              </span>
            ))}
            <span>· +n = entraram hoje</span>
          </p>
        </div>
      )}
    </section>
  );
}
