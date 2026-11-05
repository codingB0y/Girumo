"use client";

import Link from "next/link";
import { useState } from "react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";
import { AbasInstagram } from "../abas";
import { AcoesEmMassa } from "./acoes-em-massa";
import { dataDoDia } from "./datas";
import { FichaLateral } from "./ficha-da-pessoa";
import { FiltrosDasPessoas } from "./filtros-das-pessoas";
import { NumerosDasPessoas } from "./numeros-das-pessoas";
import { TabelaDasPessoas } from "./tabela-das-pessoas";
import { queryDosFiltros, usePessoas, type Filtros } from "./use-pessoas";

/** O corpo de `filtros` que as rotas de etiqueta em massa entendem (sem os vazios). */
function filtrosParaCorpo(f: Filtros) {
  return { ...(f.q.trim() && { q: f.q.trim() }), ...(f.tags.length && { tags: f.tags }), ...(f.campo && f.valor && { campo: f.campo, valor: f.valor }), recencia: f.recencia };
}

export function PessoasTela() {
  const { filtros, mudarFiltros, pagina, setPagina, lista, stats, carga, codigo, recarregar } = usePessoas();
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const [todosOsFiltrados, setTodosOsFiltrados] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const toast = useToast();

  const limparSelecao = () => {
    setSelecionadas(new Set());
    setTodosOsFiltrados(false);
  };
  const aoMudarFiltros = (f: Filtros) => {
    limparSelecao();
    mudarFiltros(f);
  };
  const aoMudarPagina = (n: number) => {
    limparSelecao();
    setPagina(n);
  };
  const alternar = (id: string) => {
    setTodosOsFiltrados(false);
    setSelecionadas((s) => {
      const novo = new Set(s);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  };
  const alternarTodas = () => {
    setTodosOsFiltrados(false);
    const ids = lista?.pessoas.map((p) => p.id) ?? [];
    setSelecionadas((s) => (ids.every((id) => s.has(id)) ? new Set() : new Set(ids)));
  };

  const aplicar = async (acao: "add" | "remove", etiqueta: string) => {
    const quantas = todosOsFiltrados ? (lista?.total ?? 0) : selecionadas.size;
    if (todosOsFiltrados) {
      const ok = await pedirConfirmacao({ titulo: `${acao === "add" ? "Pôr" : "Tirar"} a etiqueta em ${quantas} pessoas?`, texto: "Vale para todas as que o filtro mostra, não só as desta página.", rotulo: acao === "add" ? "Pôr etiqueta" : "Tirar etiqueta" });
      if (!ok) return;
    }
    setOcupado(true);
    const alvo = todosOsFiltrados ? { filtros: filtrosParaCorpo(filtros) } : { ids: [...selecionadas] };
    const r = await fetch("/api/ig/contacts/bulk-tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...alvo, [acao]: [etiqueta] }) }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) {
      const erro = (await r?.json().catch(() => null)) as { error?: string } | null;
      toast(erro?.error ?? "Não deu pra aplicar. Tente de novo.", "error");
      return;
    }
    toast(acao === "add" ? "Etiqueta posta." : "Etiqueta tirada.", "success");
    limparSelecao();
    void recarregar();
  };

  const acesso = lista?.acesso;
  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.tamanho)) : 1;
  const camposDasColunas = [...(stats?.campos ?? [])].sort((a, b) => b.pessoas - a.pessoas).map((c) => c.campo);
  const filtrando = queryDosFiltros(filtros) !== "";

  return (
    <section className="px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-20 font-semibold text-volt-950">Instagram</h1>
          <p className="mt-1 text-13 text-slate-600">Quem já falou com a loja, com as etiquetas e os campos guardados.</p>
        </div>
        {acesso?.podeExportar && (
          <a href={`/api/ig/contacts/export?${queryDosFiltros(filtros)}`} download className="inline-flex h-9 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950">
            Exportar CSV
          </a>
        )}
      </header>
      <AbasInstagram ativa="pessoas" />

      {carga === "sem-acesso" ? (
        <p role="status" className="pn-aviso mt-5">
          {codigo === "instagram_disabled" ? "O Instagram não está liberado para esta loja." : "Você não tem acesso a esta tela."}{" "}
          <Link href="/painel/instagram" className="text-cobalt-500">Voltar</Link>
        </p>
      ) : (
        <>
          {acesso?.somenteLeitura && (
            <p role="status" className="pn-aviso mt-4">
              O Instagram foi cancelado: as pessoas ficam só para leitura e exportação.
              {acesso.fichasSomemEm && ` As fichas somem em ${dataDoDia(acesso.fichasSomemEm)}; exporte o CSV antes.`}
            </p>
          )}
          <NumerosDasPessoas stats={stats} />
          <FiltrosDasPessoas filtros={filtros} stats={stats} aoMudar={aoMudarFiltros} />

          <div className="mt-4 rounded-[10px] border border-line-200 bg-paper-0">
            {(selecionadas.size > 0 || todosOsFiltrados) && lista && (
              <AcoesEmMassa selecionadas={selecionadas.size} totalDoFiltro={lista.total} todosOsFiltrados={todosOsFiltrados} ocupado={ocupado} aoSelecionarTodosOsFiltrados={() => setTodosOsFiltrados(true)} aoAplicar={(a, e) => void aplicar(a, e)} aoLimpar={limparSelecao} />
            )}
            {carga === "carregando" && !lista && <span role="status" aria-label="Carregando pessoas" className="pn-skeleton m-5 block h-5 w-64 rounded-[var(--radius-chip)]" />}
            {carga === "erro" && (
              <p role="alert" className="px-5 py-8 text-center text-13 text-slate-600">
                Não deu pra carregar as pessoas. <button type="button" onClick={() => void recarregar()} className="text-cobalt-500">Tentar de novo</button>
              </p>
            )}
            {lista && carga !== "erro" && lista.pessoas.length === 0 && (
              <p role="status" className="px-5 py-8 text-center text-13 text-slate-600">
                {filtrando ? "Ninguém com esses filtros." : "Ninguém ainda. Quando alguém comentar ou mandar direct, aparece aqui."}
              </p>
            )}
            {lista && carga !== "erro" && lista.pessoas.length > 0 && (
              <TabelaDasPessoas pessoas={lista.pessoas} campos={camposDasColunas} selecionadas={selecionadas} selecionavel={!lista.acesso.somenteLeitura} aoAlternar={alternar} aoAlternarTodas={alternarTodas} aoAbrir={setAberta} />
            )}
          </div>

          {lista && lista.total > lista.tamanho && (
            <nav aria-label="Páginas" className="mt-3 flex items-center justify-between text-13 text-slate-600">
              <span className="font-data tabular-nums">Página {pagina} de {paginas} · {lista.total} pessoas</span>
              <span className="flex gap-2">
                <button type="button" disabled={pagina <= 1} onClick={() => aoMudarPagina(pagina - 1)} className="h-9 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-volt-950 disabled:opacity-50">Anterior</button>
                <button type="button" disabled={pagina >= paginas} onClick={() => aoMudarPagina(pagina + 1)} className="h-9 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-volt-950 disabled:opacity-50">Próxima</button>
              </span>
            </nav>
          )}
        </>
      )}

      {aberta && acesso && (
        <FichaLateral
          key={aberta}
          id={aberta}
          acesso={acesso}
          aoFechar={() => setAberta(null)}
          aoMudou={() => void recarregar()}
          aoApagada={() => {
            setAberta(null);
            void recarregar();
          }}
        />
      )}
      {folhaDeConfirmacao}
    </section>
  );
}
