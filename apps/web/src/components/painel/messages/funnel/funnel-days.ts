/**
 * Repetição do roteiro nos dias seguintes (Grade do dia).
 *
 * Não é o `recurrence: "daily"` do agendamento: aquele reenvia o MESMO
 * broadcast e a oferta relâmpago só abre na 1ª vez (a rota recusa oferta em
 * disparo recorrente). Aqui cada dia vira um funil avulso, com `funnel_run_id`
 * e oferta próprios — a peça e a quantidade mudam de um dia para o outro.
 */
import type { FunnelField } from "@/lib/funnels/templates";
import { anchorFrom, isoLocalDate, stepDay, type StepDraft } from "./funnel-plan";

/** Dias depois da âncora que dá para marcar: a semana da grade. */
export const REPEAT_WINDOW = 6;

export type DayDrafts = Readonly<Record<string, StepDraft>>;

/** Os `REPEAT_WINDOW` dias seguintes à âncora, em ISO local. Âncora inválida: nenhum. */
export function repeatOptions(anchorDate: string): string[] {
  const base = anchorFrom(anchorDate, "", false);
  if (!base) return [];
  return Array.from({ length: REPEAT_WINDOW }, (_, i) =>
    isoLocalDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i + 1)),
  );
}

/** Âncora primeiro, depois os marcados que ainda cabem na janela, em ordem. */
export function funnelDays(anchorDate: string, repeat: readonly string[]): string[] {
  return [anchorDate, ...repeatOptions(anchorDate).filter((d) => repeat.includes(d))];
}

/** "qua 30/09". */
export function dayLabel(isoDate: string): string {
  const d = anchorFrom(isoDate, "", false);
  return d ? stepDay(d) : isoDate;
}

/**
 * Rascunho de um dia extra: o do 1º dia com o que o lojista trocou por cima.
 * Campo em branco no dia extra herda (a tela mostra o valor herdado como
 * placeholder; apagar o que digitou volta para ele, nunca vira campo vazio).
 */
export function draftsForDay(base: DayDrafts, override: DayDrafts): Record<string, StepDraft> {
  const saida: Record<string, StepDraft> = {};
  for (const id of new Set([...Object.keys(base), ...Object.keys(override)])) {
    const b = base[id] ?? {};
    const o = override[id] ?? {};
    const fields: Partial<Record<FunnelField, string>> = { ...b.fields };
    for (const [campo, valor] of Object.entries(o.fields ?? {})) {
      if (valor?.trim()) fields[campo as FunnelField] = valor;
    }
    saida[id] = { ...b, ...o, fields };
  }
  return saida;
}
