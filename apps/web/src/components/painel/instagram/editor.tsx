"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, List, Workflow } from "lucide-react";
import { useCasca, useFoco } from "@/components/painel/casca-context";
import { useToast } from "@/components/toast";
import { textoDoSalvamento } from "@/lib/ig/flow/salvamento";
import type { FlowDef } from "@/lib/ig/flow/types";
import { validateFlow, type Issue } from "@/lib/ig/flow/validate";
import { guardarVisao, lerVisao, type Visao } from "@/lib/ig/visao";
import { cn } from "@/lib/utils";
import type { CampanhaOpcao } from "./bloco-form";
import { ChipEstado } from "./chip-estado";
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

// Ordem dos nós e arestas é canônica, então comparar o JSON basta.
const mudou = (draft: FlowDef, published: FlowDef | null) => !published || JSON.stringify(draft) !== JSON.stringify(published);

export function EditorDoFluxo({ id }: { id: string }) {
  useFoco();
  const { instagram } = useCasca();
  const toast = useToast();
  const ver = useSearchParams().get("ver");
  const { flow, carga, naoAchou, salvamento, editar, renomear, publicar } = useFluxo(id);
  const [visao, setVisao] = useState<Visao>("passo");
  const campanhas = useCampanhas();
  const [issuesDoServidor, setIssuesDoServidor] = useState<Issue[] | null>(null);
  const [publicando, setPublicando] = useState(false);

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
        ? validateFlow(flow.draft, {
            campaignSlugs: campanhas ? campanhas.map((c) => c.slug) : null,
            accountConnected: instagram ? instagram.account?.status === "active" : null,
            keywordsInUse: [],
          })
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
  const renomearELimpar = useCallback(
    (nome: string) => {
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
      <header className="flex h-14 items-center gap-3 border-b border-line-200 bg-paper-0 px-4">
        <Link href="/painel/instagram" aria-label="Voltar pra lista de fluxos" className="flex h-9 items-center gap-1 text-13 text-slate-600 hover:text-volt-950">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Instagram
        </Link>
        <input
          aria-label="Nome do fluxo"
          value={flow.name}
          onChange={(e) => renomearELimpar(e.target.value)}
          maxLength={80}
          className="min-w-0 flex-1 bg-transparent text-15 font-semibold text-volt-950 outline-none"
        />
        <ChipEstado status={flow.status} />
        <span role="status" className="hidden text-12 text-slate-600 sm:block">{textoDoSalvamento(salvamento)}</span>
        {mostraPublicar && (
          <button
            type="button"
            onClick={() => void aoPublicar()}
            disabled={bloqueado || publicando}
            title={motivo}
            className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-acid-500 px-3 text-13 font-medium text-volt-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {flow.published ? "Publicar alteração" : "Publicar"}
          </button>
        )}
      </header>

      <div className="flex h-11 items-center justify-between border-b border-line-200 bg-paper-0 px-4">
        <span className="flex h-11 items-center border-b-2 border-volt-950 text-13 font-medium text-volt-950">Roteiro</span>
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
                  "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-13",
                  visao === v ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950",
                )}
              >
                <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      {motivo && <p className="border-b border-line-200 bg-aviso-fundo px-4 py-2 text-13 text-volt-950">{motivo}</p>}

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
    </div>
  );
}
