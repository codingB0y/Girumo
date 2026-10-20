// apps/web/src/components/painel/link-da-bio/editor.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Copy, ExternalLink, Globe } from "lucide-react";

import { ErroDeCarga } from "@/components/painel/erro-de-carga";
import { useToast } from "@/components/toast";
import { enderecoPrincipal } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { cn } from "@/lib/utils";

import { ABAS, abaDoErro, BarraDeAbas, type IdDaAba } from "./abas";
import { useEditorBio, type EditorBio } from "./use-editor-bio";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const PRIMARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const FANTASMA = `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 text-15 font-semibold text-slate-600 transition-colors hover:text-volt-950 ${FOCO}`;
const AVISO = "pn-aviso mt-4 rounded-[var(--radius-control)]";

/** Link da bio no painel (spec 2026-10-19-link-da-bio §8): liga o estado (`useEditorBio`) à tela. */
export function EditorDoLinkDaBio() {
  const editor = useEditorBio();
  const toast = useToast();
  const [aba, setAba] = useState<IdDaAba>("links");

  // Erro de campo no salvar: a tela vai para a aba que mostra o campo (é ela que mostra e foca).
  const dona = abaDoErro(editor.erro);
  useEffect(() => {
    if (dona) setAba(dona.id);
  }, [dona]);

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Endereço copiado. Agora é só colar na bio.");
    } catch {
      toast("Não deu pra copiar. Selecione o endereço e copie à mão.", "error");
    }
  }

  return <TelaDoEditor editor={editor} aba={aba} aoEscolherAba={setAba} aoCopiar={(url) => void copiar(url)} />;
}

function ChipDeEstado({ pagina }: { pagina: PaginaBio }) {
  const noAr = pagina.publicada && !pagina.bloqueadaEm;
  return <span className={cn("pn-chip", noAr && "bg-success-700/10 text-success-700")}>{noAr ? "No ar" : "Fora do ar"}</span>;
}

function Pendente({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-13 text-slate-600", className)}>
      <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-quase" />
      Alterações não salvas
    </span>
  );
}

/** Computador: "Alterações não salvas · Descartar · Salvar" à direita do título (§8). */
function AcoesDeSalvar({ editor }: { editor: EditorBio }) {
  return (
    <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
      {editor.sujo && (
        <>
          <Pendente />
          <button type="button" onClick={editor.descartar} className={FANTASMA}>
            Descartar
          </button>
        </>
      )}
      <button type="button" onClick={editor.salvar} disabled={!editor.sujo || editor.salvando} className={PRIMARIO}>
        {editor.salvando ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

/** Celular: a barra fica acima da barra de baixo (`.pn-bio-salvar` em painel-vitrine.css), só com alteração. */
function BarraDeSalvar({ editor }: { editor: EditorBio }) {
  return (
    <div
      role="region"
      aria-label="Salvar alterações"
      className="pn-bio-salvar fixed inset-x-0 z-30 flex min-h-16 items-center gap-2 border-t border-line-200 bg-paper-0 py-2.5 pl-4 pr-3 shadow-[0_-10px_24px_-18px_rgb(7_25_35/0.45)] lg:hidden"
    >
      <Pendente className="min-w-0 flex-1" />
      <button type="button" onClick={editor.descartar} className={FANTASMA}>
        Descartar
      </button>
      <button type="button" onClick={editor.salvar} disabled={editor.salvando} className={PRIMARIO}>
        {editor.salvando ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}

function Endereco({ url, dominio, aoCopiar }: { url: string; dominio: string | null; aoCopiar: (url: string) => void }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-line-200 bg-paper-0 py-1.5 pl-3 pr-1.5 lg:mt-4 lg:gap-3 lg:py-2 lg:pl-4 lg:pr-2">
      <Globe className="hidden h-5 w-5 flex-none text-slate-600 lg:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate font-data text-13 font-medium text-volt-950 lg:text-15">
        <span className="sr-only">Endereço da página: </span>
        {url}
      </p>
      {dominio && <span className="pn-chip hidden lg:inline-flex">Domínio próprio</span>}
      <button type="button" onClick={() => aoCopiar(url)} aria-label="Copiar o endereço da página" className={cn(SECUNDARIO, "min-h-10 px-3")}>
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copiar
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir a página numa aba nova"
        className={cn(SECUNDARIO, "hidden min-h-10 px-3 lg:inline-flex")}
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        Abrir
      </a>
    </div>
  );
}

function Esqueleto() {
  return (
    <div role="status" className="mt-6 space-y-3">
      <span className="sr-only">Carregando o link da bio…</span>
      <div aria-hidden="true" className="pn-skeleton h-12 rounded-xl" />
      <div aria-hidden="true" className="pn-skeleton h-72 rounded-xl" />
    </div>
  );
}

function EstadoVazio({ criando, aoCriar }: { criando: boolean; aoCriar: () => void }) {
  return (
    <section aria-labelledby="bio-vazio-titulo" className="pn-card mt-6 rounded-xl p-6">
      <h2 id="bio-vazio-titulo" className="font-brand text-20 font-bold text-volt-950">
        Monte o link da bio da loja
      </h2>
      <p className="mt-2 max-w-[60ch] text-15 text-slate-600">
        Uma página com o WhatsApp da loja, o grupo VIP e o que mais você quiser, num endereço só, pra pôr na bio do
        Instagram. Ela nasce fora do ar: você confere tudo antes de publicar.
      </p>
      <button type="button" onClick={aoCriar} disabled={criando} className={cn(PRIMARIO, "mt-4")}>
        {criando ? "Criando…" : "Criar minha página"}
      </button>
    </section>
  );
}

/** A tela (mockup "Editor no celular" e "Editor no computador"). Só desenha: o estado vem de `useEditorBio`. */
export function TelaDoEditor({
  editor,
  aba,
  aoEscolherAba,
  aoCopiar,
}: {
  editor: EditorBio;
  aba: IdDaAba;
  aoEscolherAba: (aba: IdDaAba) => void;
  aoCopiar: (url: string) => void;
}) {
  const { pagina, rascunho, contexto } = editor;
  const pronto = editor.carga === "ok" && pagina && rascunho && contexto ? { pagina, rascunho, contexto } : null;
  const dona = abaDoErro(editor.erro);
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const Conteudo = atual.Conteudo;

  return (
    // pb-40 no celular: a barra de salvar (64 px) e o "Ver como fica" (80 px) ficam por cima do fim da tela.
    <div className="pn-bio mx-auto w-full max-w-[1320px] px-4 pb-40 pt-5 lg:px-8 lg:pb-14 lg:pt-7">
      <header className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="grid min-w-0 flex-[1_1_420px] gap-1.5">
          <h1 className="flex flex-wrap items-center gap-2.5 font-brand text-[22px] font-bold leading-tight tracking-[-0.4px] text-volt-950 lg:text-28">
            Link da bio
            {pronto && <ChipDeEstado pagina={pronto.pagina} />}
          </h1>
          <p className="hidden max-w-[64ch] text-15 text-slate-600 lg:block">
            A página que vai na bio do Instagram: o WhatsApp da loja, o grupo VIP e o que mais você quiser, num endereço
            só.
          </p>
        </div>
        {pronto && <AcoesDeSalvar editor={editor} />}
      </header>

      {editor.carga === "carregando" && <Esqueleto />}
      {editor.carga === "erro" && (
        <div className="mt-6">
          <ErroDeCarga titulo="Não deu para carregar o link da bio." aoTentarDeNovo={editor.carregar} />
        </div>
      )}
      {editor.carga === "ok" && !pagina && <EstadoVazio criando={editor.criando} aoCriar={editor.criar} />}

      {pronto && (
        <>
          <Endereco
            url={enderecoPrincipal(pronto.contexto, pronto.pagina.slug)}
            dominio={pronto.contexto.dominio}
            aoCopiar={aoCopiar}
          />
          {pronto.pagina.bloqueadaEm && (
            <p className={AVISO}>A Girumo tirou esta página do ar. Ela não aparece pra ninguém até ser liberada; fale com o suporte.</p>
          )}
          {editor.conflito && (
            <div role="alert" className={cn(AVISO, "flex flex-wrap items-center gap-3")}>
              <p className="min-w-0 flex-1">{editor.conflito}</p>
              <button type="button" onClick={editor.carregar} className={SECUNDARIO}>
                Recarregar
              </button>
            </div>
          )}
          {editor.aviso && (
            <p role="alert" className={AVISO}>
              {editor.aviso}
            </p>
          )}
          {editor.erro && !dona && (
            <p role="alert" className={AVISO}>
              {editor.erro.mensagem}
            </p>
          )}
          <section aria-label="Editar a página" className="mt-5 min-w-0">
            <BarraDeAbas abas={ABAS} atual={atual.id} aoEscolher={aoEscolherAba} />
            <div role="tabpanel" id={`bio-painel-${atual.id}`} aria-labelledby={`bio-aba-${atual.id}`} className="pt-4">
              <Conteudo
                pagina={pronto.pagina}
                rascunho={pronto.rascunho}
                contexto={pronto.contexto}
                mudarDocumento={editor.mudarDocumento}
                mudarPagina={editor.mudarPagina}
                reverAnimacao={editor.reverAnimacao}
                erro={dona?.id === atual.id ? editor.erro : null}
                limparErro={editor.limparErro}
              />
            </div>
          </section>
          {editor.sujo && <BarraDeSalvar editor={editor} />}
        </>
      )}
    </div>
  );
}
