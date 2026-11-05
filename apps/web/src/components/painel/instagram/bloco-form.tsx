"use client";

import React from "react";
import { horas, tituloDoBloco } from "@/lib/ig/flow/labels";
import { DEFAULT_TEXTS } from "@/lib/ig/flow/recipes";
import {
  LINK_RESERVE_BYTES,
  MAX_BUTTON_LABEL,
  MAX_MESSAGE_BYTES,
  MAX_PUBLIC_REPLY,
  MAX_TEXT_WITH_BUTTON,
  MAX_WAIT_MINUTES,
} from "@/lib/ig/flow/types";
import { ajuda, botaoTexto, campo, nomeAcessivel, Problemas, rotulo, type FormProps } from "./bloco-comum";
import { BlocoEtiqueta } from "./bloco-etiqueta";
import { BlocoLoja } from "./bloco-loja";
import { BlocoMensagem } from "./bloco-pergunta";
import { BlocoSe } from "./bloco-se";
import { ContadorBytes } from "./contador-bytes";
import { Interruptor } from "./interruptor";
import { Palavras } from "./palavras";

export type { CampanhaOpcao } from "./bloco-comum";

/** Mesmo teto do schema (`texto` em schema.ts): o campo não aceita o que o servidor recusaria. */
const MAX_TEXTO = 4000;
const LEMBRETES = [60, 180, 360, MAX_WAIT_MINUTES];

/** Opções do select; se o valor salvo não é uma das fixas (rascunho antigo), ele entra na lista pra não sumir. */
const comAtual = (opcoes: number[], atual: number) => (opcoes.includes(atual) ? opcoes : [...opcoes, atual].sort((a, b) => a - b));

export function BlocoForm({ node, def, confirmar, primeiroDepoisDoComentario, campanhas, issues, chaves, aoMudar, editarDef }: FormProps) {
  const doBloco = issues.filter((i) => i.nodeId === node.id);
  const nome = nomeAcessivel(tituloDoBloco(node), node.id);
  if (node.type === "trigger") {
    return (
      <div className="grid gap-4">
        <div>
          <span className={rotulo}>Palavras que disparam <span className="font-normal text-slate-600">vale com ou sem acento, no meio da frase</span></span>
          <div className="mt-1"><Palavras palavras={node.keywords} aoMudar={(keywords) => aoMudar({ keywords })} /></div>
        </div>
        {node.on === "comment" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={rotulo}>Onde vale</span>
              <p className={`${campo} mt-1 text-slate-600`}>Qualquer post ou reel</p>
              <p className={ajuda}>Escolher um post específico chega com a conexão da conta.</p>
            </div>
            <div>
              <span className="flex items-center justify-between">
                <span className={rotulo}>Responder no comentário</span>
                <Interruptor ligado={node.publicReply !== null} aoMudar={(on) => aoMudar({ publicReply: on ? DEFAULT_TEXTS.respostaPublica : null })} rotulo="Responder no comentário" />
              </span>
              {node.publicReply !== null && (
                <input aria-label={nome("Resposta pública")} maxLength={MAX_PUBLIC_REPLY} value={node.publicReply} onChange={(e) => aoMudar({ publicReply: e.target.value })} className={`${campo} mt-1`} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className={rotulo}>Resposta a story também conta</span>
            <Interruptor ligado={node.storyReplies} aoMudar={(storyReplies) => aoMudar({ storyReplies })} rotulo="Resposta a story também conta" />
          </div>
        )}
        <Problemas issues={doBloco} />
      </div>
    );
  }

  if (node.type === "message") {
    return <BlocoMensagem node={node} primeiroDepoisDoComentario={primeiroDepoisDoComentario} issues={issues} chaves={chaves} aoMudar={aoMudar} editarDef={editarDef} />;
  }

  if (node.type === "invite") {
    const conviteComBotao = node.button != null;
    return (
      <div className="grid gap-4">
        <label className="block">
          <span className={rotulo}>Campanha do convite</span>
          <select aria-label={nome("Campanha do convite")} value={node.campaignSlug ?? ""} onChange={(e) => aoMudar({ campaignSlug: e.target.value || null })} className={`${campo} mt-1`}>
            <option value="">Escolha a campanha</option>
            {node.campaignSlug && !campanhas.some((c) => c.slug === node.campaignSlug) && (
              <option value={node.campaignSlug}>{node.campaignSlug} (não existe mais)</option>
            )}
            {campanhas.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <p className={ajuda}>O link sai da campanha e leva a pessoa pro grupo com vaga.</p>
        </label>
        <label className="block">
          <span className="flex items-center justify-between">
            <span className={rotulo}>Mensagem</span>
            {conviteComBotao ? (
              <ContadorBytes texto={node.text} max={MAX_TEXT_WITH_BUTTON} emCaracteres />
            ) : (
              <ContadorBytes texto={node.text} max={MAX_MESSAGE_BYTES} reserva={LINK_RESERVE_BYTES} />
            )}
          </span>
          <textarea aria-label={nome("Mensagem do convite")} maxLength={MAX_TEXTO} value={node.text} onChange={(e) => aoMudar({ text: e.target.value })} rows={3} className={`${campo} mt-1 resize-y`} />
          <p className={ajuda}>{conviteComBotao ? "O link da campanha vai no botão, embaixo da mensagem." : "O link da campanha entra no fim, sozinho."}</p>
        </label>
        {primeiroDepoisDoComentario ? (
          <div>
            <p className={ajuda}>Sem botão neste direct: é o único que a Meta deixa mandar por comentário, e o Instagram recusa botão pra quem não segue a loja. Pra ter botão, pergunte antes (receita “Comentou, confirma e entra no grupo”).</p>
            {conviteComBotao && (
              <button type="button" onClick={() => aoMudar({ button: null })} className={`mt-2 ${botaoTexto}`}>
                Tirar botão
              </button>
            )}
          </div>
        ) : (
          <div>
            <span className="flex items-center justify-between">
              <span className={rotulo}>Link num botão</span>
              <Interruptor ligado={conviteComBotao} aoMudar={(on) => aoMudar({ button: on ? DEFAULT_TEXTS.botaoConvite : null })} rotulo={nome("Link num botão")} />
            </span>
            {conviteComBotao && <input aria-label={nome("Texto do botão do convite")} maxLength={MAX_BUTTON_LABEL} value={node.button ?? ""} onChange={(e) => aoMudar({ button: e.target.value })} className={`${campo} mt-1`} />}
          </div>
        )}
        {node.remindAfterMinutes !== null && (
          <label className="block">
            <span className={rotulo}>Lembrar quem não clicou depois de</span>
            <select aria-label={nome("Lembrar depois de")} value={node.remindAfterMinutes} onChange={(e) => aoMudar({ remindAfterMinutes: Number(e.target.value) })} className={`${campo} mt-1`}>
              {comAtual(LEMBRETES, node.remindAfterMinutes).map((m) => <option key={m} value={m}>{horas(m)}</option>)}
            </select>
          </label>
        )}
        <Problemas issues={doBloco} />
      </div>
    );
  }

  if (node.type === "handoff") return <BlocoLoja node={node} issues={issues} aoMudar={aoMudar} />;
  if (node.type === "tag") return <BlocoEtiqueta node={node} issues={issues} aoMudar={aoMudar} />;
  return <BlocoSe node={node} def={def} confirmar={confirmar} issues={issues} chaves={chaves} aoMudar={aoMudar} editarDef={editarDef} />;
}
