"use client";

import { horas, tituloDoBloco } from "@/lib/ig/flow/labels";
import type { NodePatch } from "@/lib/ig/flow/edit";
import { DEFAULT_TEXTS } from "@/lib/ig/flow/recipes";
import {
  LINK_RESERVE_BYTES,
  MAX_BUTTON_LABEL,
  MAX_MESSAGE_BYTES,
  MAX_PUBLIC_REPLY,
  MAX_TEXT_WITH_BUTTON,
  MAX_WAIT_MINUTES,
  type FlowNode,
} from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";
import { ContadorBytes } from "./contador-bytes";
import { Interruptor } from "./interruptor";
import { Palavras } from "./palavras";

export type CampanhaOpcao = { slug: string; name: string };

/** Mesmo teto do schema (`texto` em schema.ts): o campo não aceita o que o servidor recusaria. */
const MAX_TEXTO = 4000;
const ESPERAS = [60, 360, 720, MAX_WAIT_MINUTES];
const LEMBRETES = [60, 180, 360, MAX_WAIT_MINUTES];

/** Opções do select; se o valor salvo não é uma das fixas (rascunho antigo), ele entra na lista pra não sumir. */
const comAtual = (opcoes: number[], atual: number) => (opcoes.includes(atual) ? opcoes : [...opcoes, atual].sort((a, b) => a - b));

const rotulo = "text-13 font-medium text-volt-950";
const campo = "w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 py-2 text-13 text-volt-950 outline-none focus:border-slate-600";
const ajuda = "mt-1 text-12 text-slate-600";
const erro = "mt-1 text-12 text-warning-700";

function Problemas({ issues }: { issues: Issue[] }) {
  return issues.length ? <ul>{issues.map((i, n) => <li key={`${i.code}-${n}`} className={erro}>{i.text}</li>)}</ul> : null;
}

export function BlocoForm({ node, primeiroDepoisDoComentario, campanhas, issues, aoMudar }: {
  node: FlowNode;
  primeiroDepoisDoComentario: boolean;
  campanhas: CampanhaOpcao[];
  issues: Issue[];
  aoMudar: (patch: NodePatch) => void;
}) {
  const doBloco = issues.filter((i) => i.nodeId === node.id);
  // Nome acessível único por bloco: dois diretos têm o mesmo título, o id desempata.
  const nome = (campo: string) => `${campo}: ${tituloDoBloco(node)} (${node.id})`;

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
    const comBotao = node.button !== null;
    return (
      <div className="grid gap-4">
        <label className="block">
          <span className="flex items-center justify-between">
            <span className={rotulo}>Mensagem</span>
            <ContadorBytes texto={node.text} max={comBotao ? MAX_TEXT_WITH_BUTTON : MAX_MESSAGE_BYTES} emCaracteres={comBotao} />
          </span>
          <textarea aria-label={nome("Mensagem")} maxLength={MAX_TEXTO} value={node.text} onChange={(e) => aoMudar({ text: e.target.value })} rows={3} className={`${campo} mt-1 resize-y`} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {node.wait && (
            <div>
              <label className="block">
                <span className={rotulo}>Esperar a resposta por</span>
                <select aria-label={nome("Esperar por quanto tempo")} value={node.wait.minutes} onChange={(e) => aoMudar({ wait: { minutes: Number(e.target.value) } })} className={`${campo} mt-1`}>
                  {comAtual(ESPERAS, node.wait.minutes).map((m) => <option key={m} value={m}>{horas(m)}</option>)}
                </select>
              </label>
              <p className={ajuda}>Quem não responde para aqui. A janela da Meta é de 24 h.</p>
            </div>
          )}
          <div>
            {primeiroDepoisDoComentario ? (
              <>
                <p className={ajuda}>Sem botão neste direct: é o único que a Meta deixa mandar por comentário, e o Instagram recusa botão pra quem não segue a loja.</p>
                {comBotao && (
                  <button type="button" onClick={() => aoMudar({ button: null })} className="mt-2 text-13 font-medium text-volt-950 underline underline-offset-2">
                    Tirar botão
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="flex items-center justify-between">
                  <span className={rotulo}>Botão</span>
                  <Interruptor ligado={comBotao} aoMudar={(on) => aoMudar({ button: on ? "Quero o link" : null })} rotulo={nome("Botão")} />
                </span>
                {comBotao && <input aria-label={nome("Texto do botão")} maxLength={MAX_BUTTON_LABEL} value={node.button ?? ""} onChange={(e) => aoMudar({ button: e.target.value })} className={`${campo} mt-1`} />}
              </>
            )}
          </div>
        </div>
        <Problemas issues={doBloco} />
      </div>
    );
  }

  if (node.type === "invite") {
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
            <ContadorBytes texto={node.text} max={MAX_MESSAGE_BYTES} reserva={LINK_RESERVE_BYTES} />
          </span>
          <textarea aria-label={nome("Mensagem do convite")} maxLength={MAX_TEXTO} value={node.text} onChange={(e) => aoMudar({ text: e.target.value })} rows={3} className={`${campo} mt-1 resize-y`} />
          <p className={ajuda}>O link da campanha entra no fim, sozinho.</p>
        </label>
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

  return <p className="text-13 text-slate-600">Confere na hora se a pessoa segue a loja. Quem não segue recebe o pedido pra seguir e volta pra cá quando responder.</p>;
}
