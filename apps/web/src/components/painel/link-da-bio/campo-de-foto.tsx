// apps/web/src/components/painel/link-da-bio/campo-de-foto.tsx
"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";

import type { MidiaRef } from "@/lib/bio/documento";
import { FOTO_ACEITA, MAX_FOTOS_DO_LINK, problemaDaImagem, type TipoDeFoto } from "@/lib/bio/editor-perfil";
import { pontoDoFoco, urlDaImagem } from "@/lib/bio/render/partes";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { cn } from "@/lib/utils";

/**
 * Campos de foto do editor do link da bio (spec 2026-10-19 §4): a capa e as logos (Perfil), a
 * foto da fachada e as fotos do botão (folha de link). O arquivo sobe direto pro Storage
 * (`uploadMediaFile`), nunca pela função da Vercel (limite de 4,5 MB), com o `kind` que a
 * página pública lê: `lp-media` para foto, `lp-logo` para logo. A miniatura vem pelo
 * otimizador (`urlDaImagem`): foto de 10 MB não desce inteira no 4G.
 */

const ACEITA = FOTO_ACEITA.join(",");
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 disabled:cursor-wait disabled:opacity-60 ${FOCO}`;
const FANTASMA = `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 text-15 font-semibold text-slate-600 transition-colors hover:text-volt-950 ${FOCO}`;
const PERIGO = `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-1 text-13 font-semibold text-danger-700 hover:bg-canvas-100 ${FOCO}`;

function srcDaMiniatura(id: string, largura: number): string {
  return urlDaImagem(id, largura) ?? "";
}

function mensagemDoEnvio(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Não deu pra enviar a foto. Tente de novo.";
}

/** Confere e sobe uma foto. Volta sem foco (§4: só a capa tem foco, ajustado depois). */
async function enviarFoto(arquivo: File, tipo: TipoDeFoto): Promise<MidiaRef> {
  const problema = problemaDaImagem(arquivo, tipo);
  if (problema) throw new Error(problema);
  const { id } = await uploadMediaFile(arquivo, tipo);
  return { id, foco: null };
}

export type FormatoDaFoto = "foto" | "logo-clara" | "logo-escura";

function Miniatura({ valor, formato }: { valor: MidiaRef | null; formato: FormatoDaFoto }) {
  if (formato === "foto") {
    if (!valor) {
      return (
        <span
          aria-hidden="true"
          className="grid h-20 w-16 flex-none place-items-center rounded-lg border border-dashed border-line-200 bg-canvas-100 text-slate-600"
        >
          <ImagePlus className="h-5 w-5" />
        </span>
      );
    }
    const ponto = pontoDoFoco(valor.foco);
    return (
      <img
        src={srcDaMiniatura(valor.id, 128)}
        alt=""
        width={64}
        height={80}
        style={ponto ? { objectPosition: `${ponto.x}% ${ponto.y}%` } : undefined}
        className="h-20 w-16 flex-none rounded-lg bg-canvas-100 object-cover"
      />
    );
  }
  // Logo clara vai em fundo escuro, logo escura em fundo claro: é assim que a página escolhe (§3).
  const escuro = formato === "logo-clara";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-14 w-[120px] flex-none place-items-center rounded-lg p-2",
        escuro ? "bg-volt-950 text-paper-0" : "border border-line-200 bg-canvas-100 text-slate-600",
      )}
    >
      {valor ? (
        <img src={srcDaMiniatura(valor.id, 256)} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <ImagePlus className="h-5 w-5" />
      )}
    </span>
  );
}

export type PropsDoCampoDeFoto = {
  /** Id do botão de escolher: o foco do erro do salvar chega nele. */
  id: string;
  /** Rótulo visível ("Foto da loja"). */
  rotulo: string;
  /** Nome lido no botão ("foto da loja" → "Trocar foto da loja"). */
  nome: string;
  ajuda?: string;
  tipo: TipoDeFoto;
  formato: FormatoDaFoto;
  valor: MidiaRef | null;
  aoMudar: (foto: MidiaRef | null) => void;
  /** Erro do salvar neste campo (ex.: foto que não é da loja). */
  erro?: string;
  /** Botões a mais na linha (o "Ajustar o foco" da capa). */
  acoes?: ReactNode;
};

/** Uma foto (capa, logo, fachada): miniatura, Escolher/Trocar e Remover. */
export function CampoDeFoto({ id, rotulo, nome, ajuda, tipo, formato, valor, aoMudar, erro, acoes }: PropsDoCampoDeFoto) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const mensagem = falha ?? erro;
  const verbo = valor ? "Trocar" : "Escolher";
  const coisa = formato === "foto" ? "foto" : "logo";
  const descricoes = [mensagem ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null].filter(Boolean).join(" ") || undefined;

  async function enviar(arquivo: File) {
    setFalha(null);
    setEnviando(true);
    try {
      aoMudar(await enviarFoto(arquivo, tipo));
    } catch (e) {
      setFalha(mensagemDoEnvio(e));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = ""; // mandar o mesmo arquivo de novo dispara o change
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Miniatura valor={valor} formato={formato} />
        <div className="grid min-w-0 gap-1.5">
          <span className={ROTULO}>{rotulo}</span>
          {ajuda && (
            <span id={`${id}-ajuda`} className={AJUDA}>
              {ajuda}
            </span>
          )}
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              id={id}
              onClick={() => entrada.current?.click()}
              disabled={enviando}
              aria-label={enviando ? undefined : `${verbo} ${nome}`}
              aria-describedby={descricoes}
              className={SECUNDARIO}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {enviando ? "Enviando…" : `${verbo} ${coisa}`}
            </button>
            {valor && !enviando && (
              <button type="button" aria-label={`Remover ${nome}`} onClick={() => aoMudar(null)} className={FANTASMA}>
                Remover
              </button>
            )}
            {acoes}
          </span>
        </div>
      </div>
      {mensagem && (
        <p id={`${id}-erro`} role="alert" className={ERRO}>
          {mensagem}
        </p>
      )}
      <input
        ref={entrada}
        type="file"
        accept={ACEITA}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void enviar(arquivo);
        }}
      />
    </div>
  );
}

export type PropsDoCampoDeFotos = {
  id: string;
  valor: readonly MidiaRef[];
  aoMudar: (fotos: MidiaRef[]) => void;
  /** Erro do salvar em `link.fotos`. */
  erro?: string;
};

/** As fotos do botão (`link.fotos`, até 3, §4): miniatura com Remover e "Escolher fotos" (várias de uma vez). */
export function CampoDeFotos({ id, valor, aoMudar, erro }: PropsDoCampoDeFotos) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const cabem = MAX_FOTOS_DO_LINK - valor.length;
  const mensagem = falha ?? erro;

  async function enviar(arquivos: File[]) {
    setFalha(null);
    setEnviando(true);
    let lista = [...valor];
    try {
      for (const arquivo of arquivos.slice(0, cabem)) {
        lista = [...lista, await enviarFoto(arquivo, "lp-media")];
        aoMudar(lista);
      }
      if (arquivos.length > cabem) setFalha(`Cabem ${MAX_FOTOS_DO_LINK} fotos no botão: as outras ficaram de fora.`);
    } catch (e) {
      setFalha(mensagemDoEnvio(e));
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    // Com 3 fotos o botão some: o grupo recebe o foco do erro do salvar (id e tabIndex -1).
    <div id={cabem > 0 ? undefined : id} tabIndex={cabem > 0 ? undefined : -1} className="grid gap-1.5">
      <span id={`${id}-rotulo`} className={ROTULO}>
        Fotos no botão (opcional, até 3)
      </span>
      <div className="flex flex-wrap items-start gap-2">
        {valor.length > 0 && (
          <ul aria-labelledby={`${id}-rotulo`} className="flex gap-2">
            {valor.map((foto, i) => (
              <li key={`${foto.id}-${i}`} className="grid w-14 justify-items-center gap-0.5">
                {urlDaImagem(foto.id, 128) && (
                  <img
                    src={srcDaMiniatura(foto.id, 128)}
                    alt=""
                    width={48}
                    height={56}
                    className="h-14 w-12 rounded-lg bg-canvas-100 object-cover"
                  />
                )}
                <button
                  type="button"
                  aria-label={`Remover a foto ${i + 1}`}
                  disabled={enviando}
                  onClick={() => {
                    setFalha(null);
                    aoMudar(valor.filter((_, j) => j !== i));
                  }}
                  className={PERIGO}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        {cabem > 0 && (
          <button
            type="button"
            id={id}
            aria-describedby={[mensagem ? `${id}-erro` : null, `${id}-ajuda`].filter(Boolean).join(" ")}
            onClick={() => entrada.current?.click()}
            disabled={enviando}
            className={SECUNDARIO}
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {enviando ? "Enviando…" : "Escolher fotos"}
          </button>
        )}
      </div>
      <span id={`${id}-ajuda`} className={AJUDA}>
        Com fotos, o botão mostra as capas no lugar do ícone.
      </span>
      {mensagem && (
        <p id={`${id}-erro`} role="alert" className={ERRO}>
          {mensagem}
        </p>
      )}
      <input
        ref={entrada}
        type="file"
        accept={ACEITA}
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          if (arquivos.length > 0) void enviar(arquivos);
        }}
      />
    </div>
  );
}
