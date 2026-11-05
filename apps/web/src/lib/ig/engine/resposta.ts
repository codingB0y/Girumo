import { choiceFromPayload, matchChoice } from "@/lib/ig/flow/choices";
import { choiceOut, type FlowDef, type FlowOut, type MessageNode } from "@/lib/ig/flow/types";
import { matchKeyword } from "@/lib/ig/match-keyword";
import type { MensagemRecebida } from "@/lib/ig/webhook/events";
import { payloadDoBotao, type Retomada } from "./advance";

const MAX_VALOR = 200;
/** Formato do payload das nossas respostas rápidas: `<run>:<bloco>:<i>`. */
const RESPOSTA_RAPIDA = /^[^:]+:[^:]+:\d+$/;

/**
 * Qual saída a resposta da pessoa toma no bloco que esperava (spec §4.1), ou `null` = não libera
 * o bloco (o run segue esperando e o direct cai no caminho normal).
 */
export function decidirRetomada(def: FlowDef, no: MessageNode, runId: string, ev: MensagemRecebida): Retomada | null {
  const texto = (ev.message.text ?? "").trim();
  const choices = no.choices ?? [];
  const guardar = (valor: string) => (no.saveTo && valor ? { campo: no.saveTo, valor } : undefined);

  if (choices.length > 0) {
    const payload = ev.metadata?.postbackPayload;
    const doToque = payload ? choiceFromPayload(payload, runId, no.id) : null;
    // Toque numa resposta rápida de outro run ou bloco (chip velho): não é resposta a esta pergunta.
    if (payload && doToque === null && RESPOSTA_RAPIDA.test(payload)) return null;
    const i = doToque ?? matchChoice(texto, choices);
    if (i !== null) return { nodeId: no.id, out: choiceOut(i), guardar: guardar(choices[i]) };
    // `other` sem ligação: o robô continua esperando uma resposta que case.
    if (!def.edges.some((e) => e.from === no.id && e.out === "other")) return null;
    return { nodeId: no.id, out: "other", guardar: guardar(texto.slice(0, MAX_VALOR)) };
  }

  if (!libera(no, runId, ev)) return null;
  return { nodeId: no.id, out: "replied", guardar: guardar(texto.slice(0, MAX_VALOR)) };
}

/** Sem escolhas: toque no botão do bloco, ou uma das palavras (sem palavras = qualquer resposta). */
function libera(no: MessageNode, runId: string, ev: MensagemRecebida): boolean {
  if (ev.metadata?.postbackPayload === payloadDoBotao(runId, no.id)) return true;
  const palavras = (no.wait?.keywords ?? []).filter((k) => k.trim());
  return palavras.length === 0 || matchKeyword(ev.message.text ?? "", palavras) !== null;
}

/** Saída de reserva quando o run já foi reivindicado e a regra não decide mais (fluxo republicado no meio). */
export const saidaDeReserva = (no: MessageNode): FlowOut => (no.choices?.length ? "other" : "replied");
