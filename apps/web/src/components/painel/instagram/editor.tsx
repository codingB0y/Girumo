"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, List, Workflow } from "lucide-react";
import { useCasca, useFoco } from "@/components/painel/casca-context";
import { useToast } from "@/components/toast";
import { foraDaFase } from "@/lib/ig/flow/fase";
import { textoDoSalvamento } from "@/lib/ig/flow/salvamento";
import type { FlowDef } from "@/lib/ig/flow/types";
import { validateFlow, type Issue } from "@/lib/ig/flow/validate";
import { guardarVisao, lerVisao, type Visao } from "@/lib/ig/visao";
import { cn } from "@/lib/utils";
import { Atendimentos } from "./atendimentos";
import type { CampanhaOpcao } from "./bloco-form";
import { ChipEstado } from "./chip-estado";
import { Interruptor } from "./interruptor";
import { Mapa } from "./mapa";
import { PraPublicar } from "./pra-publicar";
import { Previa } from "./previa";
import { Trilha } from "./trilha";
import { useFluxo } from "./use-fluxo";

const VISOES = [
  ["passo", List, "Passo a passo"],
  ["mapa", Workflow, "Mapa"],
] as const;

/** `null` até a lista chegar: o validador não confere campanha sem ela. */
function useCampanhas(): CampanhaOpcao[] | null {
  const [campanhas, setCampanhas] = useState<CampanhaOpcao[] | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/campanhas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((lista: unknown) => {
        if (!vivo || !Array.isArray(lista)) return;
        setCampanhas(
          lista
            .filter((c): c is { slug: string; name?: unknown } => typeof c?.slug === "string")
            .map((c) => ({ slug: c.slug, name: String(c.name ?? c.slug) })),
        );
      })
      .catch(() => {}); // sem a lista, o servidor confere na hora de publicar
    return () => {
      vivo = false;
    };
  }, []);
  return campanhas;
}

/** JSON com as chaves dos objetos em ordem; arrays mantêm a ordem. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

const mudou = (draft: FlowDef, published: FlowDef | null) => !published || canonico(draft) !== canonico(published);

const ABAS = [["roteiro", "Roteiro"], ["atendimentos", "Atendimentos"]] as const;

export function EditorDoFluxo({ id }: { id: string }) {
  useFoco();
  const { instagram } = useCasca();
  const toast = useToast();
  const ver = useSearchParams().get("ver");
  const { flow, carga, naoAchou, salvamento, editar, renomear, publicar, mudarEstado } = useFluxo(id);
  const [visao, setVisao] = useState<Visao>("passo");
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("roteiro");
  const campanhas = useCampanhas();
  const [issuesDoServidor, setIssuesDoServidor] = useState<Issue[] | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [nomeLocal, setNomeLocal] = useState<string | null>(null);

  // Depois da hidratação: o SSR não enxerga o localStorage.
  useEffect(() => {
    try {
      setVisao(lerVisao(window.localStorage, ver));
    } catch {
      /* storage bloqueado: fica no passo a passo */
    }
  }, [ver]);

  const issuesDoCliente = useMemo(
    () =>
      flow
        ? [
            ...validateFlow(flow.draft, {
              campaignSlugs: campanhas ? campanhas.map((c) => c.slug) : null,
              accountConnected: instagram ? instagram.account?.status === "active" : null,
              keywordsInUse: [],
            }),
            ...foraDaFase(flow.draft),
          ]
        : [],
    [flow, campanhas, instagram],
  );
  // A lista do servidor (409) vale até a próxima edição.
  const issues = issuesDoServidor ?? issuesDoCliente;

  const editarELimpar = useCallback(
    (fn: (def: FlowDef) => FlowDef) => {
      setIssuesDoServidor(null);
      editar(fn);
    },
    [editar],
  );
  // Nome vazio fica só na tela: o servidor recusa (400) e o PATCH seguinte levaria o mesmo nome.
  const renomearELimpar = useCallback(
    (nome: string) => {
      setNomeLocal(nome);
      if (!nome.trim()) return;
      setIssuesDoServidor(null);
      renomear(nome);
    },
    [renomear],
  );

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    try {
      guardarVisao(window.localStorage, v);
    } catch {
      /* acessar window.localStorage pode lançar: a visão vale só nesta aba */
    }
  };

  const aoPublicar = async () => {
    setPublicando(true);
    const r = await publicar();
    setPublicando(false);
    if (r.tipo === "ok") {
      setIssuesDoServidor(null);
      toast("Fluxo publicado.", "success");
    } else if (r.tipo === "issues") {
      setIssuesDoServidor(r.issues);
      toast("Ainda falta coisa pra publicar. Veja a lista.", "error");
    } else {
      toast(r.mensagem, "error");
    }
  };

  if (instagram?.enabled === false) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
        <p className="mt-2 max-w-[52ch] text-13 text-slate-600">
          O Instagram ainda não está liberado para esta loja. Fale com a Girumo para ligar.
        </p>
      </section>
    );
  }
  if (carga === "carregando" && !flow) {
    return (
      <div className="p-6">
        <span role="status" aria-label="Carregando fluxo" className="pn-skeleton block h-7 w-56 rounded-[var(--radius-chip)]" />
      </div>
    );
  }
  if (naoAchou) {
    return (
      <div className="p-6">
        <p className="text-15 text-volt-950">Fluxo não encontrado.</p>
        <Link href="/painel/instagram" className="mt-2 inline-block text-13 text-cobalt-500">Voltar pra lista</Link>
      </div>
    );
  }
  if (carga === "erro" || !flow) {
    return (
      <div className="p-6">
        <p className="text-13 text-slate-600">
          Não deu pra carregar o fluxo. <Link href="/painel/instagram" className="text-cobalt-500">Voltar</Link>
        </p>
      </div>
    );
  }

  const bloqueado = issues.length > 0;
  const motivo = bloqueado ? issues[0].text : undefined;
  const mostraPublicar = mudou(flow.draft, flow.published);

  return (
    <div className="flex min-h-screen flex-col bg-canvas-100">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-200 bg-paper-0 px-4 py-2">
        <h1 className="sr-only">{flow.name}</h1>
        <Link href="/painel/instagram" aria-label="Voltar pra lista de fluxos" className="flex h-9 items-center gap-1 text-13 text-slate-600 hover:text-volt-950">
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Instagram</span>
        </Link>
        {/* Abaixo de sm o nome ganha a linha de baixo, inteira. */}
        <input
          aria-label="Nome do fluxo"
          value={nomeLocal ?? flow.name}
          onChange={(e) => renomearELimpar(e.target.value)}
          onBlur={() => setNomeLocal(null)}
          maxLength={80}
          className="order-last h-9 min-w-0 basis-full bg-transparent text-15 font-semibold text-volt-950 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 sm:order-none sm:basis-0 sm:flex-1"
        />
        <span className="ml-auto sm:ml-0"><ChipEstado status={flow.status} /></span>
        {flow.published && (
          <Interruptor
            ligado={flow.status === "live"}
            rotulo="No ar"
            desabilitado={publicando}
            aoMudar={(ligado) => {
              void mudarEstado(ligado ? "live" : "paused").then((erro) => {
                if (erro) toast(erro, "error");
                else toast(ligado ? "Fluxo no ar." : "Fluxo pausado.", "success");
              });
            }}
          />
        )}
        {/* Falha de salvamento aparece em qualquer tela; "Salvo"/"Salvando…" só de sm pra cima. */}
        <span
          role="status"
          className={cn("text-12 text-slate-600", salvamento === "erro" || salvamento === "falhou" ? "font-medium text-volt-950" : "hidden sm:block")}
        >
          {textoDoSalvamento(salvamento)}
        </span>
        {mostraPublicar && (
          <button
            type="button"
            onClick={() => void aoPublicar()}
            disabled={bloqueado || publicando}
            title={motivo}
            className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-3 text-13 font-medium text-canvas-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {flow.published ? "Publicar alteração" : "Publicar"}
          </button>
        )}
      </header>

      <div className="flex h-11 items-center justify-between border-b border-line-200 bg-paper-0 px-4">
        <div role="tablist" aria-label="Abas do fluxo" className="flex h-11 items-center gap-4">
          {ABAS.map(([chave, texto]) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={aba === chave}
              onClick={() => setAba(chave)}
              className={cn("flex h-11 items-center border-b-2 text-13", aba === chave ? "border-volt-950 font-medium text-volt-950" : "border-transparent text-slate-600 hover:text-volt-950")}
            >
              {texto}
            </button>
          ))}
        </div>
        {aba === "roteiro" && (
          <div className="flex items-center gap-2">
            <span className="text-12 text-slate-600">Ver como</span>
            <div role="group" aria-label="Ver como" className="flex gap-1">
              {VISOES.map(([v, Icone, texto]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={visao === v}
                  onClick={() => trocarVisao(v)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-13",
                    visao === v ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950",
                  )}
                >
                  <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                  {texto}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {motivo && <p className="border-b border-line-200 bg-aviso-fundo px-4 py-2 text-13 text-volt-950">{motivo}</p>}

      {aba === "roteiro" ? (
        <div className="grid flex-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6">
          {visao === "passo" ? (
            <Trilha def={flow.draft} campanhas={campanhas ?? []} issues={issues} editar={editarELimpar} />
          ) : (
            <div className="grid content-start gap-3">
              <Mapa def={flow.draft} />
              <p className="text-12 text-slate-600">O mapa é só pra olhar por enquanto. Pra mudar um bloco, troque pra “Passo a passo”.</p>
            </div>
          )}
          <aside className="grid gap-5 self-start">
            <Previa def={flow.draft} handle={instagram?.account?.username ?? null} />
            <PraPublicar issues={issues} />
          </aside>
        </div>
      ) : (
        <div className="flex-1 p-4 lg:p-6">
          <Atendimentos id={id} />
        </div>
      )}
    </div>
  );
}
