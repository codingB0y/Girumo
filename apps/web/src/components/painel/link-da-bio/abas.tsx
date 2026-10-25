// apps/web/src/components/painel/link-da-bio/abas.tsx
"use client";

import React, { type ComponentType, type KeyboardEvent } from "react";

import type { ContextoDoEditor, ErroDeCampo, EstadoSalvavel } from "@/lib/bio/editor";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { cn } from "@/lib/utils";

import { AbaAparencia } from "./aba-aparencia";
import { AbaLinks } from "./aba-links";
import { AbaPerfil } from "./aba-perfil";
import type { EditorBio } from "./use-editor-bio";

export type IdDaAba = "links" | "aparencia" | "perfil" | "divulgar";

/**
 * O que cada aba recebe do editor. A aba só desenha e chama estas funções; quem guarda o estado é
 * `useEditorBio`. O documento muda sempre por função (`mudarDocumento(d => …)`): duas mudanças no
 * mesmo clique não se atropelam.
 */
export type PropsDaAba = {
  /** A versão salva (a do servidor). */
  pagina: PaginaBio;
  /** O que está na tela, ainda sem salvar. */
  rascunho: EstadoSalvavel;
  /** O resto do GET: campanhas, domínio, origem Girumo, sugestão de slug, links escondidos pela API. */
  contexto: ContextoDoEditor;
  mudarDocumento: EditorBio["mudarDocumento"];
  /** Slug e publicada do rascunho (aba Divulgar, 6b). */
  mudarPagina: EditorBio["mudarPagina"];
  /** A prévia toca a entrada de novo: link novo, troca de modelo, "Rever a animação". */
  reverAnimacao: () => void;
  /** Erro de campo do salvar que é DESTA aba (`dona`); null nas outras. */
  erro: ErroDeCampo | null;
  /** A aba já mostrou (ou guardou) o erro: ele sai do editor. */
  limparErro: () => void;
};

export type AbaDoEditor = {
  id: IdDaAba;
  nome: string;
  /** Esta aba mostra o campo? (`campo` = caminho do zod: "links.2.numero", "perfil.nome", "slug"). */
  dona: (campo: string) => boolean;
  Conteudo: ComponentType<PropsDaAba>;
};

/** As abas do editor, na ordem da tela (§8: Links · Aparência · Perfil · Divulgar). O 6b acrescenta as três aqui. */
export const ABAS: readonly AbaDoEditor[] = [
  { id: "links", nome: "Links", dona: (campo) => campo === "links" || campo.startsWith("links."), Conteudo: AbaLinks },
  { id: "aparencia", nome: "Aparência", dona: (campo) => /^(modelo|paleta|cores|animar)(\.|$)/.test(campo), Conteudo: AbaAparencia },
  // Sem `rastreio`: o PR 7 acrescenta junto com os campos do "Avançado" (sem eles, o erro cai no aviso da tela).
  { id: "perfil", nome: "Perfil", dona: (campo) => /^(perfil|confere|feitoComGirumo)(\.|$)/.test(campo), Conteudo: AbaPerfil },
];

/** A aba que mostra o campo do erro, se alguma mostra. */
export function abaDoErro(erro: ErroDeCampo | null): AbaDoEditor | undefined {
  return erro ? ABAS.find((aba) => aba.dona(erro.campo)) : undefined;
}

/** Tecla na barra de abas (WAI-ARIA): setas andam em roda, Home e End vão às pontas. */
export function abaPelaTecla(atual: number, tecla: string, total: number): number | null {
  if (tecla === "ArrowRight") return (atual + 1) % total;
  if (tecla === "ArrowLeft") return (atual - 1 + total) % total;
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  return null;
}

/** Barra de abas com tabindex móvel: a seta escolhe e leva o foco (ativação automática). */
export function BarraDeAbas({
  abas,
  atual,
  aoEscolher,
}: {
  abas: readonly AbaDoEditor[];
  atual: IdDaAba;
  aoEscolher: (id: IdDaAba) => void;
}) {
  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // Alt+← e Ctrl+Home são do navegador
    const destino = abaPelaTecla(i, e.key, abas.length);
    if (destino === null) return;
    e.preventDefault();
    const id = abas[destino].id;
    aoEscolher(id);
    document.getElementById(`bio-aba-${id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label="Partes da página" className="flex border-b border-line-200 lg:gap-6">
      {abas.map((aba, i) => {
        const ativa = aba.id === atual;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`bio-aba-${aba.id}`}
            aria-selected={ativa}
            aria-controls={`bio-painel-${aba.id}`}
            tabIndex={ativa ? 0 : -1}
            onClick={() => aoEscolher(aba.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
            className={cn(
              "relative min-h-12 flex-1 px-0.5 text-center font-brand text-[14px] font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt-500 lg:flex-none lg:text-15",
              ativa
                ? "text-volt-950 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-volt-950"
                : "text-slate-600 hover:text-volt-950",
            )}
          >
            {aba.nome}
          </button>
        );
      })}
    </div>
  );
}
