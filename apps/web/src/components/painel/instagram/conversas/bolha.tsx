"use client";

import React, { useState } from "react";
import { rotuloDaBolha, horaCurta } from "@/lib/ig/conversas/tela";
import type { AnexoDto, MensagemDto } from "@/lib/ig/conversas/tipos";
import { cn } from "@/lib/utils";

const tipoDe = (a: AnexoDto): "imagem" | "video" | "audio" | "outro" => {
  const t = `${a.tipo} ${a.mime ?? ""}`.toLowerCase();
  if (t.includes("image") || t.includes("photo")) return "imagem";
  if (t.includes("video")) return "video";
  if (t.includes("audio")) return "audio";
  return "outro";
};
const ROTULO = { imagem: "Foto", video: "Vídeo", audio: "Áudio", outro: "Anexo" } as const;

/**
 * Anexo pela rota de mídia (302 para um link novo da Zernio). Se o navegador não carregar o arquivo dentro da
 * página (política de segurança ou link vencido), vira um link que abre o arquivo numa aba.
 */
function Anexo({ conversaId, mensagemId, anexo }: { conversaId: string; mensagemId: string; anexo: AnexoDto }) {
  const [falhou, setFalhou] = useState(false);
  const tipo = tipoDe(anexo);
  const src = `/api/ig/conversations/${conversaId}/media?mid=${encodeURIComponent(mensagemId)}&i=${anexo.indice}`;
  if (falhou || tipo === "outro") {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-13 font-medium text-cobalt-500 underline">
        Abrir {ROTULO[tipo].toLowerCase()}{anexo.nome ? ` (${anexo.nome})` : ""}
      </a>
    );
  }
  if (tipo === "imagem") {
    // eslint-disable-next-line @next/next/no-img-element -- o destino é um 302 para o link assinado da Zernio; o otimizador do Next não passa por ele.
    return <img src={src} alt="Foto enviada na conversa" loading="lazy" onError={() => setFalhou(true)} className="max-h-72 max-w-full rounded-[var(--radius-control)]" />;
  }
  if (tipo === "video") {
    return <video src={src} controls preload="none" aria-label="Vídeo enviado na conversa" onError={() => setFalhou(true)} className="max-h-72 max-w-full rounded-[var(--radius-control)]" />;
  }
  return <audio src={src} controls preload="none" aria-label="Áudio enviado na conversa" onError={() => setFalhou(true)} className="h-10 w-full max-w-64" />;
}

function Corpo({ m }: { m: MensagemDto }) {
  if (m.apagada) return <span className="text-slate-600">Mensagem apagada</span>;
  const origem = m.respostaDeStory ? "Respondeu ao story" : m.mencaoEmStory ? "Mencionou a loja num story" : null;
  return (
    <>
      {origem && <span className="block text-12 text-slate-600">{origem}</span>}
      {m.texto && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.texto}</p>}
    </>
  );
}

/** Uma bolha do fio. As nossas levam Robô ou Você pelos eventos; a hora vai embaixo, como no mockup. */
export function Bolha({ conversaId, mensagem: m }: { conversaId: string; mensagem: MensagemDto }) {
  const nossa = m.direcao === "out";
  const rotulo = rotuloDaBolha(m);
  return (
    <li className={cn("flex max-w-[78%] flex-col gap-1", nossa ? "items-end self-end" : "items-start self-start")}>
      <div className={cn("flex flex-col gap-2 rounded-xl px-3.5 py-2 text-14 leading-[1.45] text-volt-950", nossa ? "rounded-br-sm bg-cobalt-soft" : "rounded-bl-sm border border-line-200 bg-paper-0")}>
        <Corpo m={m} />
        {!m.apagada && m.anexos.map((a) => <Anexo key={a.indice} conversaId={conversaId} mensagemId={m.id} anexo={a} />)}
      </div>
      <span className="text-12 text-slate-600">
        {rotulo && <>{rotulo} · </>}
        <time dateTime={m.criadaEm}>{horaCurta(m.criadaEm)}</time>
      </span>
    </li>
  );
}

/** Marca por horário (aguardando você, robô pausa aqui, resolvida). */
export function MarcaDoFioLinha({ texto }: { texto: string }) {
  return (
    <li className="self-center">
      <span className="inline-flex items-center rounded-full bg-canvas-100 px-2.5 py-1 text-12 text-slate-600">{texto}</span>
    </li>
  );
}
