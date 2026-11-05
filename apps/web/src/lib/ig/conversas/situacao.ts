import { createHash } from "node:crypto";

/** Regras puras das Conversas do Instagram (spec §7.3 e §7.5). Sem banco, sem relógio próprio. */

export type StatusConversa = "open" | "waiting" | "resolved";
export type JanelaMeta = "aberta" | "humano" | "fechada";

const HORA_MS = 3600_000;

/**
 * Janela da Meta desde a última mensagem DELA (`ig_contacts.last_dm_at`): até 24 h o robô e a loja
 * respondem; de 24 h a 7 dias só a loja, como atendimento humano; depois disso, fechada até ela escrever.
 * Sem registro ou data ilegível: fechada (nunca abre a janela no escuro).
 */
export function janela(lastDmAt: string | null, agora: Date): JanelaMeta {
  if (!lastDmAt) return "fechada";
  const t = Date.parse(lastDmAt);
  if (Number.isNaN(t)) return "fechada";
  const horas = (agora.getTime() - t) / HORA_MS;
  if (horas <= 24) return "aberta";
  return horas <= 24 * 7 ? "humano" : "fechada";
}

/**
 * Situação ao chegar um direct dela. O robô ter mandado algo de volta = Aberta; calado (nenhum fluxo
 * casou, resposta que não liberou a espera) ou pausado = Aguardando você. Mensagem nova reabre a
 * Resolvida pelas mesmas regras, então a situação atual não entra na conta.
 */
export function situacaoAoReceber(i: { atual?: StatusConversa; robotRespondeu: boolean; robotPausado: boolean }): StatusConversa {
  return i.robotRespondeu && !i.robotPausado ? "open" : "waiting";
}

/** A loja respondeu pelo painel: a conversa fica Aberta. */
export function situacaoAoResponderPelaLoja(): StatusConversa {
  return "open";
}

/**
 * Marcador de quem a loja apagou: sha256 de `tenantId:igUserId`. A varredura do "Atualizar" compara
 * por este hash e pula quem foi apagada; o id do Instagram nunca fica em claro na tabela.
 */
export function tombstoneHash(tenantId: string, igUserId: string): string {
  return createHash("sha256").update(`${tenantId}:${igUserId}`).digest("hex");
}
