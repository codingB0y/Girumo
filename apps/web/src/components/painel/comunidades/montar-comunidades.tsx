"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/lib/supabase/client";
import { numero } from "@/lib/painel/grupos";
import { TETO_DA_COMUNIDADE } from "@/lib/communities/lotacao";
import {
  GRUPO_GRANDE_A_PARTIR_DE,
  GRUPO_INTERNO_ATE,
  piorCasoDoGrupo,
  TETO_DO_GRUPO,
  type CandidatoAoPlano,
  type RespostaDoPlano,
} from "@/lib/communities/plano";
import { PlanoDasComunidades } from "./plano-das-comunidades";

/** Quantos grupos a tabela mostra antes do "Ver os outros". */
const LINHAS_VISIVEIS = 10;

type Props = { aoFechar: () => void };

/** Grupo que não é grande mas no pior caso passa da metade do teto: não divide comunidade com um grande. */
function ehMedio(c: CandidatoAoPlano): boolean {
  return !c.grande && piorCasoDoGrupo(c.members) > TETO_DA_COMUNIDADE / 2;
}

function rotuloDoTamanho(c: CandidatoAoPlano): string {
  if (c.grande) return `Grande · ${GRUPO_GRANDE_A_PARTIR_DE}+`;
  if (ehMedio(c)) return `Médio · pode dobrar até ${numero(TETO_DO_GRUPO)}`;
  return "Pequeno";
}

/**
 * "Montar comunidades": o lojista escolhe os grupos e a Girumo devolve o plano (quantas comunidades e
 * que grupos em cada uma). Só leitura: quem cria e vincula é o lojista, no celular.
 */
export function MontarComunidades({ aoFechar }: Props) {
  const [resposta, setResposta] = useState<RespostaDoPlano | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  // Cada clique dispara um cálculo; só a resposta do último vale.
  const ultimoPedido = useRef(0);

  const calcular = useCallback(async (incluir?: string[]) => {
    const pedido = ++ultimoPedido.current;
    setErro(null);
    try {
      const res = await authenticatedFetch("/api/comunidades/plano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incluir === undefined ? {} : { incluir }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Não deu pra montar o plano.");
      if (pedido === ultimoPedido.current) setResposta(data as RespostaDoPlano);
    } catch (e) {
      if (pedido === ultimoPedido.current) setErro(e instanceof Error ? e.message : "Não deu pra montar o plano.");
    }
  }, []);

  useEffect(() => {
    calcular();
  }, [calcular]);

  function alternar(id: string) {
    if (!resposta) return;
    const candidatos = resposta.candidatos.map((c) => (c.whatsappGroupId === id ? { ...c, incluido: !c.incluido } : c));
    setResposta({ ...resposta, candidatos });
    calcular(candidatos.filter((c) => c.incluido).map((c) => c.whatsappGroupId));
  }

  const candidatos = resposta?.candidatos ?? [];
  const clientes = candidatos.filter((c) => !c.interno);
  const internos = candidatos.filter((c) => c.interno);
  const visiveis = verTodos ? clientes : clientes.slice(0, LINHAS_VISIVEIS);
  const plano = resposta?.plano;
  const noPlano = plano ? plano.comunidades.reduce((total, c) => total + c.grupos.length, 0) : 0;
  const medios = candidatos.filter((c) => c.incluido && ehMedio(c)).map((c) => c.name);

  return (
    <section aria-labelledby="montar-titulo" className="pn-card space-y-6 rounded-[var(--radius-control)] p-5 sm:p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="max-w-[720px]">
          <h2 id="montar-titulo" className="text-[20px] font-semibold text-volt-950">
            Montar comunidades
          </h2>
          <p className="mt-1.5 text-14 leading-relaxed text-slate-600">
            Postar grupo por grupo é o que mais expõe o número. Numa comunidade, o post sai uma vez só, pelo grupo de Avisos,
            e chega em todos os grupos dela. A Girumo diz quantas comunidades criar e que grupos vão em cada uma.{" "}
            <strong className="text-volt-950">Quem cria e vincula é você, no celular</strong>: a Girumo não mexe em nada no
            WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          className="min-h-11 self-start rounded-[var(--radius-control)] border border-line-200 px-3.5 text-14 font-semibold text-volt-950 hover:bg-canvas-100"
        >
          Fechar
        </button>
      </div>

      {erro && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta">
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => calcular(resposta ? candidatos.filter((c) => c.incluido).map((c) => c.whatsappGroupId) : undefined)}
            className="font-medium underline underline-offset-2"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!resposta && !erro && (
        <div className="space-y-3" role="status" aria-label="Montando o plano">
          <div className="pn-skeleton h-20 rounded-xl" />
          <div className="pn-skeleton h-64 rounded-xl" />
        </div>
      )}

      {resposta && candidatos.length === 0 && (
        <p className="rounded-xl bg-canvas-100 px-4 py-6 text-center text-14 text-slate-600">
          Nenhum grupo para planejar: todos os grupos que o número administra já estão em comunidade.
        </p>
      )}

      {resposta && plano && candidatos.length > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line-200 bg-line-200 md:grid-cols-4">
            <Numero rotulo="Grupos no plano" valor={numero(noPlano)} />
            <Numero
              rotulo="Pessoas hoje"
              valor={`${plano.pessoasEstimadas ? "até " : ""}${numero(plano.pessoasHoje)}`}
              detalhe={plano.pessoasEstimadas ? "estimativa por cima" : "quem está em 2 grupos conta 1 vez"}
            />
            <Numero rotulo="Comunidades" valor={numero(plano.comunidades.length)} />
            <Numero
              rotulo="Envios por post"
              valor={`${numero(noPlano)} → ${numero(plano.comunidades.length)}`}
              detalhe="um por comunidade, pelo Avisos"
            />
          </dl>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-16 font-semibold text-volt-950">1 · Grupos</h3>
              <p className="text-13 text-slate-600">
                {candidatos.length === 1
                  ? "O grupo que o número administra e que ainda não está em comunidade."
                  : `Os ${numero(candidatos.length)} grupos que o número administra e que ainda não estão em comunidade.`}{" "}
                Desmarque o que não quer vincular.
              </p>
            </div>

            {clientes.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-line-200">
                <table className="w-full border-collapse text-14">
                  <thead>
                    <tr className="bg-canvas-100 text-left text-12 text-slate-600">
                      <th scope="col" className="w-11 px-3 py-2">
                        <span className="sr-only">No plano</span>
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">Grupo</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Pessoas</th>
                      <th scope="col" className="px-3 py-2 font-medium">Tamanho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((c) => (
                      <tr key={c.whatsappGroupId} className="border-t border-line-200">
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={c.incluido}
                            onChange={() => alternar(c.whatsappGroupId)}
                            aria-label={`Incluir ${c.name} no plano`}
                            className="h-[18px] w-[18px] accent-cobalt-500"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-volt-950">{c.name}</td>
                        <td className="font-data px-3 py-1.5 text-right tabular-nums">{numero(c.members)}</td>
                        <td className="px-3 py-1.5 text-13 text-slate-600">{rotuloDoTamanho(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clientes.length > LINHAS_VISIVEIS && (
                  <div className="border-t border-line-200 px-3">
                    <button
                      type="button"
                      onClick={() => setVerTodos((v) => !v)}
                      aria-expanded={verTodos}
                      className="min-h-11 text-13 font-semibold text-cobalt-500"
                    >
                      {verTodos ? "Mostrar menos" : `Ver os outros ${numero(clientes.length - LINHAS_VISIVEIS)} grupos`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {internos.length > 0 && (
              <details className="rounded-xl border border-dashed border-line-200 bg-canvas-100/60 px-4 py-3">
                <summary className="cursor-pointer text-14 font-semibold text-volt-950">
                  Não vincular · {numero(internos.length)} {internos.length === 1 ? "grupo interno" : "grupos internos"} (1 a{" "}
                  {GRUPO_INTERNO_ATE} pessoas)
                </summary>
                <p className="mb-2.5 mt-2 text-13 text-slate-600">
                  Grupos de entrega, caixa e conferência não são de clientes e não entram no plano. Marque se algum for.
                </p>
                <div className="flex flex-wrap gap-2">
                  {internos.map((c) => (
                    <label
                      key={c.whatsappGroupId}
                      className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line-200 bg-paper-0 px-3 text-13 text-volt-950"
                    >
                      <input
                        type="checkbox"
                        checked={c.incluido}
                        onChange={() => alternar(c.whatsappGroupId)}
                        className="h-4 w-4 accent-cobalt-500"
                      />
                      {c.name} <span className="font-data tabular-nums text-slate-600">{numero(c.members)}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>

          <PlanoDasComunidades plano={plano} medios={medios} />
        </>
      )}
    </section>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="bg-paper-0 px-4 py-3.5">
      <dt className="text-12 text-slate-600">{rotulo}</dt>
      <dd className="font-data text-[24px] font-semibold tabular-nums text-volt-950">{valor}</dd>
      {detalhe && <dd className="text-12 text-slate-600">{detalhe}</dd>}
    </div>
  );
}
