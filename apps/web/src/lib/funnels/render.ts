/**
 * Datas e copy do funil. Puro; roda no cliente.
 *
 * Fuso: hora LOCAL do navegador, igual à sub-aba Agendar
 * (`new Date(`${date}T${time}`).toISOString()` em schedule-composer.tsx).
 */
import type { FunnelField, FunnelStep } from "./templates";

const CHAVE = /\{([^}]+)\}/g;

/** Data da etapa a partir da âncora. Não muta a âncora. */
export function resolveStepDate(anchor: Date, step: FunnelStep): Date {
  const d = new Date(anchor.getTime());
  d.setDate(d.getDate() + step.at.days);
  if (step.at.time !== undefined) {
    const [h, m] = step.at.time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }
  return new Date(d.getTime() + (step.at.minutes ?? 0) * 60_000);
}

/** `{dia}` = "sábado, 10/10" · `{hora}` = "20h" ou "19h30". */
export function anchorValues(anchor: Date): { dia: string; hora: string } {
  const dia = anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const h = anchor.getHours();
  const m = anchor.getMinutes();
  const hora = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  return { dia, hora };
}

export function copyKeys(copy: string): string[] {
  return [...copy.matchAll(CHAVE)].map((m) => m[1]);
}

/** Troca as {chaves}. Lança se alguma estiver ausente ou vazia. */
export function renderCopy(copy: string, values: Record<string, string>): string {
  return copy.replace(CHAVE, (_, chave: string) => {
    const valor = values[chave]?.trim();
    if (!valor) throw new Error(`campo vazio: ${chave}`);
    return valor;
  });
}

export function missingFields(step: FunnelStep, values: Record<string, string>): FunnelField[] {
  return step.fields.filter((f) => !values[f]?.trim());
}

/**
 * Toda chave da copy que está vazia — inclusive loja/nicho/link/dia/hora.
 *
 * `missingFields` só olha `step.fields`, então não vê essas cinco; e é
 * exatamente por elas que `renderCopy` lança. Quem for decidir se o botão
 * "Agendar" pode ser clicado precisa desta, não daquela.
 */
export function missingKeys(copy: string, values: Record<string, string>): string[] {
  return [...new Set(copyKeys(copy))].filter((k) => !values[k]?.trim());
}
