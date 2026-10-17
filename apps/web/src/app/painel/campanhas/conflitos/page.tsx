"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { faltaEscolher, type ConflitoDeGrupo } from "@/lib/campaigns/conflito-grupo";
import type { Group } from "@/lib/mock-data";
import { buscar, buscarLista } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";
import { cn } from "@/lib/utils";

type RespostaDeConflitos = { conflitos: ConflitoDeGrupo[] };

function ehRespostaDeConflitos(corpo: unknown): corpo is RespostaDeConflitos {
  return Array.isArray((corpo as { conflitos?: unknown } | null)?.conflitos);
}

// Nao pode casar com a ancora do smoke (e2e/conteudo-esperado.ts): ela existe para provar que a
// tela renderizou, nao que tentou.
const ERRO_DE_CARGA = "Não deu pra carregar os grupos que estão em duas campanhas.";
const ERRO_AO_SALVAR = "Não deu pra salvar as escolhas.";

/**
 * Grupos em duas campanhas (mockup "Conflito", spec §6.6, D4). Lista a loja inteira — o
 * `?de=<slug>` só monta o caminho de volta para a campanha de onde o lojista veio. Nada sai
 * sozinho: cada grupo espera a escolha, e "Salvar escolhas" manda uma por grupo.
 */
export default function ConflitosDeGrupoPage() {
  const [conflitos, setConflitos] = useState<ConflitoDeGrupo[] | null>(null);
  const [cargaDosConflitos, setCargaDosConflitos] = useState<Carga>("carregando");
  const [grupos, setGrupos] = useState<Group[]>([]);
  const [cargaDosGrupos, setCargaDosGrupos] = useState<Carga>("carregando");
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [de, setDe] = useState<string | null>(null);

  // Uma carga por rota: os membros são enfeite da linha, então `/api/groups` falhar não derruba
  // a lista — só esconde o número (que, inventado como 0, leria "grupo vazio").
  const carregar = useCallback(async () => {
    void buscarLista<Group>("/api/groups", setGrupos, setCargaDosGrupos);
    await buscar(
      "/api/campanhas/conflitos",
      ehRespostaDeConflitos,
      (resposta) => setConflitos(resposta.conflitos),
      setCargaDosConflitos,
    );
  }, []);

  useEffect(() => {
    setDe(new URLSearchParams(window.location.search).get("de"));
    void carregar();
  }, [carregar]);

  const membros = useMemo(() => new Map(grupos.map((g): [string, number] => [g.id, g.members])), [grupos]);

  async function salvar() {
    if (!conflitos || faltaEscolher(conflitos, escolhas) > 0) return;
    setSalvando(true);
    setErroAoSalvar(null);
    try {
      let falha: string | null = null;
      // Um POST por grupo, em sequência: se um falhar, os anteriores já valeram. A lista é lida
      // de novo de qualquer jeito — ela mostra o que sobrou, não o que a tela lembra.
      for (const c of conflitos) {
        const res = await fetch("/api/campanhas/conflitos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jid: c.whatsappGroupId, ficaEm: escolhas[c.whatsappGroupId] }),
        }).catch(() => null);
        if (!res?.ok) {
          const corpo = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
          falha = corpo?.error ?? ERRO_AO_SALVAR;
          break;
        }
      }
      await carregar();
      if (falha) setErroAoSalvar(falha);
    } finally {
      setSalvando(false);
    }
  }

  const pendentes = conflitos ? faltaEscolher(conflitos, escolhas) : 0;
  const nomeDe = de ? conflitos?.flatMap((c) => c.campanhas).find((c) => c.slug === de)?.name : undefined;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 px-4 py-8 sm:px-6">
      <nav aria-label="Caminho" className="text-13 text-slate-600">
        {de ? (
          <Link href={`/painel/campanhas/${encodeURIComponent(de)}`} className="underline underline-offset-2 hover:text-volt-950">
            {nomeDe ?? "Voltar para a campanha"}
          </Link>
        ) : (
          <Link href="/painel/campanhas" className="underline underline-offset-2 hover:text-volt-950">
            Campanhas
          </Link>
        )}{" "}
        / Grupos
      </nav>

      {erroAoSalvar && (
        <div role="alert" className="rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-sm text-alerta">
          {erroAoSalvar}
        </div>
      )}

      {cargaDosConflitos === "erro" ? (
        <ErroDeCarga titulo={ERRO_DE_CARGA} aoTentarDeNovo={() => void carregar()} />
      ) : conflitos === null ? (
        <div className="space-y-3" role="status" aria-label="Carregando os grupos">
          <div className="pn-skeleton h-9 w-96 max-w-full rounded-lg" />
          <div className="pn-skeleton h-64 rounded-xl" />
        </div>
      ) : conflitos.length === 0 ? (
        <div className="pn-card rounded-xl px-5 py-16 text-center">
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-volt-950">
            Nenhum grupo está em duas campanhas
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Cada grupo pertence a uma campanha só. Grupo que já é de outra campanha aparece travado na hora de escolher.
          </p>
        </div>
      ) : (
        <>
          <header className="space-y-1.5">
            <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">
              {conflitos.length === 1 ? "1 grupo está em duas campanhas" : `${conflitos.length} grupos estão em duas campanhas`}
            </h1>
            <p className="max-w-[780px] text-[15px] text-slate-600">
              Agora cada grupo pertence a uma campanha só. Com duas campanhas, dois links mandam gente para o mesmo grupo
              e ele enche fora de ordem. Escolha onde cada um fica — na outra campanha ele sai da lista e do link.
            </p>
          </header>

          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Escolher onde cada grupo fica" className="pn-card min-w-0 flex-[1.4_1_560px] rounded-xl">
              {conflitos.map((c) => {
                const membrosDoGrupo = cargaDosGrupos === "ok" ? membros.get(c.whatsappGroupId) : undefined;
                return (
                  <fieldset key={c.whatsappGroupId} className="min-w-0 space-y-2.5 border-b border-line-200 px-5 py-4">
                    <legend className="float-left mb-2.5 flex w-full flex-wrap items-baseline justify-between gap-3">
                      <span className="text-[15px] font-semibold text-volt-950">{c.nome}</span>
                      {typeof membrosDoGrupo === "number" && (
                        <span className="text-13 text-slate-600">
                          <span className="font-data tabular-nums">{membrosDoGrupo.toLocaleString("pt-BR")}</span> membros
                        </span>
                      )}
                    </legend>
                    {c.campanhas.map((camp) => {
                      const marcado = escolhas[c.whatsappGroupId] === camp.id;
                      return (
                        <label
                          key={camp.id}
                          className={cn(
                            "clear-both flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3",
                            marcado ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-line-200",
                          )}
                        >
                          <input
                            type="radio"
                            name={`fica-${c.whatsappGroupId}`}
                            checked={marcado}
                            onChange={() => setEscolhas((e) => ({ ...e, [c.whatsappGroupId]: camp.id }))}
                            className="h-[18px] w-[18px] accent-cobalt-500"
                          />
                          <span className="flex-1 text-sm text-volt-950">
                            Fica em <strong>{camp.name}</strong>
                          </span>
                          <span className="text-13 text-slate-600">posição {camp.posicao}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl bg-poco px-5 py-4">
                <span aria-live="polite" className="text-13 text-slate-600">
                  {pendentes > 0
                    ? `Falta escolher ${pendentes} ${pendentes === 1 ? "grupo" : "grupos"}.`
                    : "Pronto: cada grupo fica em uma campanha só."}
                </span>
                <button
                  type="button"
                  onClick={() => void salvar()}
                  disabled={pendentes > 0 || salvando}
                  className="min-h-11 rounded-lg bg-cobalt-500 px-5 text-sm font-semibold text-paper-0 transition-[filter] duration-[160ms] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {salvando ? "Salvando…" : "Salvar escolhas"}
                </button>
              </div>
            </section>

            <aside
              aria-labelledby="conflitos-daqui-pra-frente"
              className="pn-card min-w-0 flex-[1_1_380px] space-y-2 rounded-xl px-5 py-4"
            >
              <h2 id="conflitos-daqui-pra-frente" className="text-base font-semibold text-volt-950">
                Daqui pra frente, ao escolher grupos da campanha
              </h2>
              <p className="text-13 text-slate-600">
                Grupo que já é de outra campanha aparece travado, com o nome dela. Para mudar um grupo de campanha, tire
                ele da outra primeiro.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
