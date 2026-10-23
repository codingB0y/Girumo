// apps/web/src/components/painel/link-da-bio/aba-links.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Eye, Plus } from "lucide-react";

import { Interruptor } from "@/components/painel/instagram/interruptor";
import { useToast } from "@/components/toast";
import type { LinkBio } from "@/lib/bio/documento";
import {
  alternarLink,
  anuncioDaOrdem,
  avisoDoLink,
  comLink,
  contagemDosLinks,
  erroNoLink,
  MAX_LINKS,
  mesmoConteudo,
  moverLink,
  resumoDoLink,
  semLink,
  type ContextoDosAvisos,
} from "@/lib/bio/editor";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { FolhaDeLink, type InicioDaFolha } from "./folha-de-link";
import { QuadradoDoIcone } from "./icone-do-link";
import { focarDepois, ID_ADICIONAR } from "./use-editor-bio";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const PRIMARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 ${FOCO}`;
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const ORDEM = `grid h-11 w-11 flex-none place-items-center rounded-lg border border-line-200 bg-paper-0 text-volt-950 disabled:cursor-not-allowed disabled:opacity-30 ${FOCO}`;

/** Destino do foco depois de excluir (a linha some junto com o botão que abriu a folha). */
export { ID_ADICIONAR };
const idDaOrdem = (id: string, botao: "subir" | "descer") => `bio-${botao}-${id}`;

export type PropsDaLista = {
  links: readonly LinkBio[];
  ctx: ContextoDosAvisos;
  reordenando: boolean;
  /** Link que acabou de mudar de lugar ou de entrar: a linha pisca. */
  movido: string | null;
  aoEditar: (link: LinkBio) => void;
  aoAlternar: (link: LinkBio) => void;
  aoMover: (link: LinkBio, passo: -1 | 1) => void;
};

/** A lista na ordem da página (`key=id`): cada linha edita; o interruptor liga e desliga; em Reordenar, Subir/Descer. */
export function ListaDeLinks({ links, ctx, reordenando, movido, aoEditar, aoAlternar, aoMover }: PropsDaLista) {
  if (links.length === 0) {
    return <p className="px-4 py-6 text-15 text-slate-600">Nenhum link ainda. Toque em Adicionar link pra começar.</p>;
  }
  return (
    <ul aria-label="Links, na ordem em que aparecem na página">
      {links.map((link, i) => {
        const aviso = avisoDoLink(link, ctx);
        const idDoAviso = `bio-link-${link.id}-aviso`;
        return (
          <li
            key={link.id}
            className={cn(
              "border-b border-line-200 px-1.5 py-1 transition-colors duration-700 last:border-b-0",
              movido === link.id && "bg-cobalt-soft duration-0",
            )}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => aoEditar(link)}
                aria-label={`Editar o link ${link.titulo}`}
                aria-describedby={aviso ? idDoAviso : undefined}
                aria-haspopup="dialog"
                className={`flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover-ficha ${FOCO}`}
              >
                <QuadradoDoIcone icone={link.icone} apagado={!link.ativo} />
                <span className="grid min-w-0 gap-px">
                  <span
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-1 text-15 font-semibold leading-snug",
                      link.ativo ? "text-volt-950" : "text-slate-600",
                    )}
                  >
                    {link.titulo}
                    {link.tipo !== "endereco" && link.destaque && link.ativo && <span className="pn-chip">Destaque</span>}
                    {!link.ativo && <span className="pn-chip">Escondido</span>}
                  </span>
                  <span className="truncate text-13 text-slate-600">{resumoDoLink(link, ctx.campanhas)}</span>
                </span>
              </button>
              {reordenando ? (
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    id={idDaOrdem(link.id, "subir")}
                    aria-label={`Subir ${link.titulo}`}
                    disabled={i === 0}
                    onClick={() => aoMover(link, -1)}
                    className={ORDEM}
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    id={idDaOrdem(link.id, "descer")}
                    aria-label={`Descer ${link.titulo}`}
                    disabled={i === links.length - 1}
                    onClick={() => aoMover(link, 1)}
                    className={ORDEM}
                  >
                    <ArrowDown className="h-5 w-5" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <Interruptor ligado={link.ativo} aoMudar={() => aoAlternar(link)} rotulo={`Mostrar na página: ${link.titulo}`} />
              )}
            </div>
            {aviso && (
              <p id={idDoAviso} className="flex items-start gap-1.5 pb-2 pl-[62px] pr-2 text-13 font-medium text-danger-700">
                <AlertTriangle className="mt-px h-4 w-4 flex-none" aria-hidden="true" />
                {aviso}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Aba Links (spec §8): a lista, Reordenar, Adicionar link e a folha de cada link. */
export function AbaLinks({ pagina, rascunho, contexto, mudarDocumento, reverAnimacao, erro, limparErro }: PropsDaAba) {
  const toast = useToast();
  const links = rascunho.documento.links;
  const [reordenando, setReordenando] = useState(false);
  const [folha, setFolha] = useState<InicioDaFolha | null>(null);
  const [movido, setMovido] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordenando = reordenando && links.length > 1;
  const ctx: ContextoDosAvisos = {
    campanhas: contexto.campanhas,
    linksEscondidos: contexto.linksEscondidos,
    salvos: pagina.documento.links,
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Erro do salvar num link (§8, "salvar com erro → primeiro campo com erro"): a folha abre nele, com o erro no campo.
  useEffect(() => {
    if (!erro) return;
    const alvo = erroNoLink(erro);
    const link: LinkBio | undefined = alvo ? links[alvo.indice] : undefined;
    if (alvo && link) setFolha({ modo: "editar", link, erros: alvo.erros });
    else setErroDaLista(erro.mensagem);
    limparErro();
  }, [erro, links, limparErro]);

  function piscar(id: string) {
    setMovido(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMovido(null), 900);
  }

  function aplicar(link: LinkBio, novo: boolean) {
    const antes = links.find((l) => l.id === link.id);
    setFolha(null);
    setErroDaLista(null);
    // "Pronto" sem mudar nada: só fecha (sem toast pedindo um Salvar que nem aparece).
    if (antes && mesmoConteudo(antes, link)) return;
    mudarDocumento((d) => ({ ...d, links: comLink(d.links, link) }));
    if (novo) reverAnimacao(); // link novo: a prévia toca a entrada (§8)
    piscar(link.id);
    toast(novo ? "Link adicionado. Toque em Salvar pra valer na página." : "Link alterado. Toque em Salvar pra valer na página.");
  }

  function excluir(id: string) {
    const titulo = links.find((l) => l.id === id)?.titulo ?? "";
    mudarDocumento((d) => ({ ...d, links: semLink(d.links, id) }));
    setFolha(null);
    setErroDaLista(null);
    toast(`“${titulo}” foi excluído. Toque em Salvar pra valer na página.`);
    focarDepois(ID_ADICIONAR); // excluir → "Adicionar link" (§8)
  }

  function alternar(link: LinkBio) {
    mudarDocumento((d) => ({ ...d, links: alternarLink(d.links, link.id) }));
    toast(link.ativo ? `“${link.titulo}” saiu da página. Fica guardado aqui.` : `“${link.titulo}” voltou pra página.`);
  }

  function mover(link: LinkBio, passo: -1 | 1) {
    const destino = links.findIndex((l) => l.id === link.id) + passo;
    if (destino < 0 || destino >= links.length) return;
    mudarDocumento((d) => ({ ...d, links: moverLink(d.links, link.id, passo) }));
    piscar(link.id);
    setAnuncio(anuncioDaOrdem(link.titulo, destino + 1, links.length));
    // A linha troca de lugar no DOM e perde o foco; na ponta, o botão apertado desliga: o foco vai pro outro (§8).
    const naPonta = (passo === -1 && destino === 0) || (passo === 1 && destino === links.length - 1);
    const botao = naPonta ? (passo === -1 ? "descer" : "subir") : passo === -1 ? "subir" : "descer";
    focarDepois(idDaOrdem(link.id, botao));
  }

  function adicionar() {
    if (links.length >= MAX_LINKS) {
      toast(`A página aceita até ${MAX_LINKS} links. Exclua um pra pôr outro.`, "error");
      return;
    }
    setFolha({ modo: "tipos" });
  }

  return (
    <>
      <section aria-labelledby="bio-links-titulo" className="pn-card rounded-xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line-200 px-3 py-3 lg:px-4 lg:py-3.5">
          <div className="min-w-0 flex-[1_1_220px]">
            <h2 id="bio-links-titulo" className="font-brand text-15 font-bold text-volt-950">
              Links
            </h2>
            <p className="mt-0.5 text-13 text-slate-600">{contagemDosLinks(links, ctx)}</p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            {links.length > 1 && (
              <button
                type="button"
                onClick={() => setReordenando((r) => !r)}
                className={cn(
                  SECUNDARIO,
                  "flex-1 sm:flex-none",
                  ordenando && "border-volt-950 bg-volt-950 text-paper-0 hover:border-volt-950",
                )}
              >
                {ordenando ? "Pronto" : "Reordenar"}
              </button>
            )}
            <button type="button" id={ID_ADICIONAR} aria-haspopup="dialog" onClick={adicionar} className={cn(PRIMARIO, "flex-1 sm:flex-none")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar link
            </button>
          </div>
        </div>
        {erroDaLista && (
          <p role="alert" className="px-4 pt-3 text-13 font-medium text-danger-700">
            {erroDaLista}
          </p>
        )}
        <ListaDeLinks
          links={links}
          ctx={ctx}
          reordenando={ordenando}
          movido={movido}
          aoEditar={(link) => setFolha({ modo: "editar", link })}
          aoAlternar={alternar}
          aoMover={mover}
        />
      </section>
      <p className="mt-3 flex items-start gap-2 text-13 text-slate-600">
        <Eye className="mt-px h-4 w-4 flex-none" aria-hidden="true" />
        Desligado, o link some da página mas fica guardado aqui. Só um link fica em destaque.
      </p>
      {/* Subir/Descer anunciam a posição nova (§8, §11). */}
      <p aria-live="polite" className="sr-only">
        {anuncio}
      </p>
      {folha && (
        <FolhaDeLink
          inicio={folha}
          campanhas={contexto.campanhas}
          aoAplicar={aplicar}
          aoExcluir={excluir}
          aoFechar={() => setFolha(null)}
        />
      )}
    </>
  );
}
