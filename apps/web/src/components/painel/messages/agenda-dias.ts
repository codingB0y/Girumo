/**
 * Dias da Agenda da campanha no fuso de Brasília.
 *
 * O agrupamento cortava o timestamp do banco (`slice(0, 10)`, que é UTC) e
 * comparava com `toISOString()`: o post das 22h de hoje caía em "Amanhã" e,
 * depois das 21h, o das 10h virava "Ontem". As duas pontas (de que dia é o
 * post, que dia é hoje) precisam do mesmo fuso — ver `@/lib/date-br`.
 */
import { dayBR, dayBRAgo, dayBROf } from "@/lib/date-br";
import type { CampaignMessage } from "@/lib/messages-store";

/** Dia de Brasília em que a mensagem entra na agenda: a hora marcada, senão a criação. */
export function diaDaMensagem(m: Pick<CampaignMessage, "scheduledAt" | "createdAt">): string {
  const quando = m.scheduledAt ?? m.createdAt;
  return dayBROf(quando) ?? quando.slice(0, 10);
}

/** Cabeçalho do grupo: "Hoje", "Ontem", "Amanhã" ou a data por extenso. */
export function rotuloDoDia(dia: string, agora: Date = new Date()): string {
  if (dia === dayBR(agora)) return "Hoje";
  if (dia === dayBRAgo(1, agora)) return "Ontem";
  if (dia === dayBRAgo(-1, agora)) return "Amanhã";
  return new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
}
