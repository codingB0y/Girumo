"use client";

import React from "react";
import { moveChoice, removeChoice, setChoices } from "@/lib/ig/flow/choices-edit";
import { horas, tituloDoBloco } from "@/lib/ig/flow/labels";
import {
  MAX_BUTTON_LABEL,
  MAX_CHOICE_LENGTH,
  MAX_MESSAGE_BYTES,
  MAX_TEXT_WITH_BUTTON,
  MAX_WAIT_MINUTES,
  type MessageNode,
} from "@/lib/ig/flow/types";
import { ajuda, botaoTexto, campo, nomeAcessivel, Problemas, rotulo, type FormProps } from "./bloco-comum";
import { ListaEditavel } from "./bloco-lista";
import { CampoDaFicha } from "./campo-da-ficha";
import { ContadorBytes } from "./contador-bytes";
import { Interruptor } from "./interruptor";
import { Palavras } from "./palavras";

/** Mesmo teto do schema (`texto` em schema.ts): o campo não aceita o que o servidor recusaria. */
const MAX_TEXTO = 4000;
const ESPERAS = [60, 360, 720, MAX_WAIT_MINUTES];
const ESCOLHAS_INICIAIS = ["Sim", "Não"];

/** Opções do select; se o valor salvo não é uma das fixas (rascunho antigo), ele entra na lista pra não sumir. */
const comAtual = (opcoes: number[], atual: number) => (opcoes.includes(atual) ? opcoes : [...opcoes, atual].sort((a, b) => a - b));

function Modo({ comEscolhas, aoMudar, nome }: { comEscolhas: boolean; aoMudar: (escolhas: boolean) => void; nome: (c: string) => string }) {
  const opcoes = [[true, "Botões de escolha"], [false, "Texto livre"]] as const;
  return (
    <div role="group" aria-label={nome("Como a pessoa responde")} className="flex gap-1">
      {opcoes.map(([valor, texto]) => (
        <button
          key={texto}
          type="button"
          aria-pressed={comEscolhas === valor}
          onClick={() => comEscolhas !== valor && aoMudar(valor)}
          className={`flex h-8 items-center rounded-[var(--radius-control)] border px-2.5 text-13 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 ${comEscolhas === valor ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950"}`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

function Escolhas({ node, primeiroDepoisDoComentario, aoMudar, editarDef }: Pick<FormProps, "primeiroDepoisDoComentario" | "aoMudar" | "editarDef"> & { node: MessageNode }) {
  const escolhas = node.choices ?? [];
  return (
    <div>
      <span className={rotulo}>Escolhas <span className="font-normal text-slate-600">até {MAX_CHOICE_LENGTH} caracteres cada</span></span>
      <div className="mt-1">
        <ListaEditavel
          itens={escolhas}
          rotuloItem="Escolha"
          rotuloAdicionar="Adicionar escolha"
          maxCaracteres={MAX_CHOICE_LENGTH}
          aoEditar={(i, texto) => aoMudar({ choices: escolhas.map((e, j) => (j === i ? texto : e)) })}
          aoAdicionar={() => aoMudar({ choices: [...escolhas, ""] })}
          aoRemover={(i) => editarDef((d) => removeChoice(d, node.id, i))}
          aoMover={(de, para) => editarDef((d) => moveChoice(d, node.id, de, para))}
        />
      </div>
      <p className={ajuda}>Separe por vírgula para aceitar mais de uma resposta: “Sim, quero” vale para quem digitar “sim” ou “quero”.</p>
      {primeiroDepoisDoComentario && (
        <p className={ajuda} role="note">
          As escolhas valem só digitando: neste primeiro direct o Instagram não aceita botão. Diga na mensagem o que a pessoa pode responder.
        </p>
      )}
    </div>
  );
}

export function BlocoMensagem({ node, primeiroDepoisDoComentario, issues, chaves, aoMudar, editarDef }: Omit<FormProps, "node" | "campanhas" | "def" | "confirmar"> & { node: MessageNode }) {
  const nome = nomeAcessivel(tituloDoBloco(node), node.id);
  const doBloco = issues.filter((i) => i.nodeId === node.id);
  const comEscolhas = (node.choices?.length ?? 0) > 0;
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
      {node.wait && (
        <div>
          <span className={rotulo}>Como a pessoa responde</span>
          <div className="mt-1">
            <Modo comEscolhas={comEscolhas} nome={nome} aoMudar={(ligar) => editarDef((d) => setChoices(d, node.id, ligar ? ESCOLHAS_INICIAIS : []))} />
          </div>
        </div>
      )}
      {comEscolhas && <Escolhas node={node} primeiroDepoisDoComentario={primeiroDepoisDoComentario} aoMudar={aoMudar} editarDef={editarDef} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {node.wait && (
          <div>
            <label className="block">
              <span className={rotulo}>Esperar a resposta por</span>
              <select aria-label={nome("Esperar por quanto tempo")} value={node.wait.minutes} onChange={(e) => node.wait && aoMudar({ wait: { ...node.wait, minutes: Number(e.target.value) } })} className={`${campo} mt-1`}>
                {comAtual(ESPERAS, node.wait.minutes).map((m) => <option key={m} value={m}>{horas(m)}</option>)}
              </select>
            </label>
            <p className={ajuda}>Quem não responde para aqui. A janela da Meta é de 24 h.</p>
          </div>
        )}
        {!comEscolhas && (
          <div>
            {primeiroDepoisDoComentario || !node.wait ? (
              <>
                <p className={ajuda}>
                  {primeiroDepoisDoComentario
                    ? "Sem botão neste direct: é o único que a Meta deixa mandar por comentário, e o Instagram recusa botão pra quem não segue a loja."
                    : "Botão só em direct que espera a resposta: o toque é a resposta."}
                </p>
                {comBotao && (
                  <button type="button" onClick={() => aoMudar({ button: null })} className={`mt-2 ${botaoTexto}`}>
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
        )}
      </div>
      {node.wait && !comEscolhas && (
        <div>
          <span className={rotulo}>Respostas que liberam o próximo passo <span className="font-normal text-slate-600">vazio = qualquer resposta</span></span>
          <div className="mt-1">
            <Palavras rotulo={nome("Adicionar resposta")} palavras={node.wait.keywords ?? []} aoMudar={(keywords) => node.wait && aoMudar({ wait: { ...node.wait, keywords } })} />
          </div>
          {(node.wait.keywords ?? []).length > 0 && <p className={ajuda}>Outra resposta não libera o próximo passo: a pessoa continua esperando e você responde à mão.</p>}
        </div>
      )}
      {node.wait && (
        <div>
          <span className={rotulo}>Guardar em <span className="font-normal text-slate-600">onde a resposta fica na ficha da pessoa</span></span>
          <CampoDaFicha valor={node.saveTo} chaves={chaves} rotulo={nome("Guardar a resposta em")} idLista={`campos-${node.id}`} aoConfirmar={(saveTo) => aoMudar({ saveTo })} />
        </div>
      )}
      <Problemas issues={doBloco} />
    </div>
  );
}
