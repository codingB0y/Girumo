"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, List, Repeat, Workflow } from "lucide-react";
import { useCasca } from "@/components/painel/casca-context";
import { useToast } from "@/components/toast";
import { RECIPES, RECIPE_ORDER, type RecipeId } from "@/lib/ig/flow/recipes";
import { guardarVisao, lerVisao, type Visao } from "@/lib/ig/visao";
import { cn } from "@/lib/utils";

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

export function NovoFluxo() {
  const router = useRouter();
  const toast = useToast();
  const { instagram, recarregarInstagram } = useCasca();
  const [receita, setReceita] = useState<RecipeId>("comment_invite");
  const [visao, setVisao] = useState<Visao>("passo");
  const [criando, setCriando] = useState(false);

  // "Abre na última que você usou": lê depois da hidratação, o SSR não enxerga o localStorage.
  useEffect(() => {
    try {
      setVisao(lerVisao(storage(), null));
    } catch {
      /* acessar window.localStorage pode lançar: fica no passo a passo */
    }
  }, []);

  const criar = async () => {
    setCriando(true);
    try {
      const r = await fetch("/api/ig/flows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe: receita }) });
      if (!r.ok) throw new Error(String(r.status));
      const { flow } = (await r.json()) as { flow: { id: string } };
      try {
        guardarVisao(storage(), visao);
      } catch {
        /* idem */
      }
      recarregarInstagram();
      router.push(`/painel/instagram/${flow.id}?ver=${visao}`);
    } catch {
      toast("Não deu pra criar o rascunho. Tente de novo.", "error");
      setCriando(false);
    }
  };

  if (instagram === null) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <span role="status" aria-label="Carregando Instagram" className="pn-skeleton block h-7 w-40 rounded-[var(--radius-chip)]" />
      </section>
    );
  }

  if (!instagram.enabled) {
    return (
      <section className="px-5 py-6 lg:px-8">
        <h1 className="text-20 font-semibold text-volt-950">Novo fluxo</h1>
        <p className="mt-2 text-13 text-slate-600">O Instagram ainda não está liberado para esta loja.</p>
      </section>
    );
  }

  return (
    <section className="px-5 py-6 lg:px-8">
      <nav aria-label="Trilha" className="text-13 text-slate-600">
        <Link href="/painel/instagram" className="text-cobalt-500">Instagram</Link> <span aria-hidden="true">›</span> <span aria-current="page">Novo fluxo</span>
      </nav>
      <h1 className="mt-2 text-20 font-semibold text-volt-950">Novo fluxo</h1>
      <p className="mt-1 text-13 text-slate-600">Escolha por onde começar. Nada vai pro ar até você publicar.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[10px] border border-line-200 bg-paper-0">
          <h2 id="receita-titulo" className="flex h-12 items-center gap-2 border-b border-line-200 px-5 text-15 font-semibold text-volt-950">
            Receita <span className="text-12 font-normal text-slate-600">já vem montada, você só troca o texto</span>
          </h2>
          <div role="radiogroup" aria-labelledby="receita-titulo">
            {RECIPE_ORDER.map((id) => {
              const r = RECIPES[id];
              const marcada = receita === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={marcada}
                  onClick={() => setReceita(id)}
                  className={cn("grid w-full grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-line-200 px-5 py-3 text-left last:border-0 hover:bg-hover-ficha", marcada && "bg-hover-ficha")}
                >
                  <span aria-hidden="true" className={cn("mt-0.5 h-[18px] w-[18px] rounded-full border-2", marcada ? "border-cobalt-500 bg-cobalt-500 ring-2 ring-inset ring-paper-0" : "border-slate-600")} />
                  <span className="text-15 font-semibold text-volt-950">
                    {r.titulo}
                    {r.destaque && <span className="ml-2 text-12 font-medium text-slate-600">{r.destaque}</span>}
                  </span>
                  <span className="col-start-2 text-13 text-slate-600">{r.descricao}</span>
                  {r.cadeia.length > 0 && (
                    <span className="col-start-2 mt-1 flex flex-wrap items-center gap-1 text-12 text-slate-600">
                      {r.cadeia.map((passo, i) => (
                        <span key={passo} className="flex items-center gap-1">
                          {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                          <span className="rounded-[var(--radius-chip)] bg-hover-ficha px-2 py-0.5 text-volt-950">{passo}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside>
          <h2 id="visao-titulo" className="flex h-12 items-center text-15 font-semibold text-volt-950">Como você quer montar</h2>
          <div role="group" aria-labelledby="visao-titulo" className="grid grid-cols-2 gap-3">
            {(
              [
                ["passo", List, "Passo a passo", "De cima pra baixo, um passo por linha. Edita igual no celular."],
                ["mapa", Workflow, "Mapa", "O desenho inteiro, com blocos e ligações. Por enquanto só pra olhar: edita no passo a passo."],
              ] as const
            ).map(([v, Icone, titulo, descricao]) => (
              <button
                key={v}
                type="button"
                aria-pressed={visao === v}
                onClick={() => setVisao(v)}
                className={cn("rounded-[10px] border bg-paper-0 p-3 text-left", visao === v ? "border-cobalt-500" : "border-line-200")}
              >
                <span className="flex items-center gap-2 text-15 font-semibold text-volt-950">
                  <Icone className={cn("h-4 w-4", visao === v ? "text-cobalt-500" : "text-slate-600")} aria-hidden="true" />
                  {titulo}
                </span>
                <span className="mt-1 block text-12 text-slate-600">{descricao}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 flex gap-2 text-12 text-slate-600">
            <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span><span className="font-semibold text-volt-950">Dá pra trocar a qualquer hora</span> no botão Ver como. O fluxo é o mesmo nas duas.</span>
          </p>
          <div className="mt-5 flex items-center gap-3 border-t border-line-200 pt-4">
            <button type="button" onClick={() => void criar()} disabled={criando} className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-volt-950 px-4 text-13 font-medium text-canvas-100 disabled:opacity-60">
              {criando ? "Criando…" : "Criar rascunho"}
            </button>
            <span className="text-12 text-slate-600">abre na visão escolhida</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
