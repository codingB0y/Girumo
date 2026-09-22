/**
 * Hora por praça (v2 do funil). Puro; roda no cliente.
 *
 * O 06:00 dos roteiros é o ritual da Mega, no Brás, onde o atacado funciona de
 * madrugada. Bom Retiro e Região da 44 abrem às 8h (horários levantados em
 * 22/09/2026: guiadasroupas.com/qual-o-horario-de-funcionamento-das-lojas-do-bom-retiro,
 * guiadasroupas.com/mega-moda-em-goiania). Só as etapas `followsOpening` andam;
 * meio-dia, 19:00 e as relativas à hora da live ficam onde estão.
 */
import type { FunnelStep } from "./templates";

export type PracaId = "bras" | "bom-retiro" | "regiao-44" | "outra";

export type Praca = {
  readonly id: PracaId;
  readonly label: string;
  /** `undefined` = o lojista digita. */
  readonly opening?: string;
  readonly nota: string;
};

/** A hora que está escrita nos roteiros. */
export const ROTEIRO_OPENING = "06:00";

/**
 * A abertura mais tarde que ainda deixa a manhã inteira antes das etapas de
 * meio-dia ("Últimas da grade", "Reforço"): 11:00 + 12 min das vagas < 12:00.
 */
export const LATEST_OPENING = "11:00";

export const PRACAS: readonly Praca[] = [
  { id: "bras", label: "Brás", opening: ROTEIRO_OPENING, nota: "06:00, o ritual da madrugada do Brás." },
  { id: "bom-retiro", label: "Bom Retiro", opening: "08:00", nota: "08:00, quando as lojas do Bom Retiro abrem." },
  { id: "regiao-44", label: "Região da 44", opening: "08:00", nota: "08:00, quando as lojas da 44 abrem (7h na sexta e no sábado)." },
  { id: "outra", label: "Outro horário", nota: "Vale qualquer hora até 11:00." },
];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const dois = (n: number) => String(n).padStart(2, "0");

export function isValidOpening(hhmm: string): boolean {
  return HHMM.test(hhmm) && minutos(hhmm) <= minutos(LATEST_OPENING);
}

export function openingOf(praca: PracaId, digitada: string): string {
  return PRACAS.find((p) => p.id === praca)?.opening ?? digitada;
}

/** Etapa presa à abertura anda junto com ela, mantendo a distância (06:12 → 08:12). */
export function atOpening(step: FunnelStep, opening: string): FunnelStep {
  if (!step.followsOpening || step.at.time === undefined) return step;
  const t = minutos(step.at.time) - minutos(ROTEIRO_OPENING) + minutos(opening);
  return { ...step, at: { ...step.at, time: `${dois(Math.floor(t / 60))}:${dois(t % 60)}` } };
}
