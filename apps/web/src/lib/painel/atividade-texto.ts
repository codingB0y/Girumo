import { diaMesBR, horaBR } from "@/lib/date-br";
import type { Barra } from "@/lib/painel/atividade";
import { numero } from "@/lib/painel/grupos";

/** Quem entrou e quem saiu num período. */
export type Movimento = { entraram: number; sairam: number };

export const unidadeDeEntradas: [string, string] = ["entrou", "entraram"];
export const unidadeDeSaidas: [string, string] = ["saiu", "saíram"];

/** "+29", "−3", "0": o sinal de menos tipográfico, não o hífen. */
export function saldo(n: number): string {
  if (n > 0) return `+${n.toLocaleString("pt-BR")}`;
  if (n < 0) return `−${Math.abs(n).toLocaleString("pt-BR")}`;
  return "0";
}

/** "medindo desde 29/09" ou, quando a medição começou no meio do dia, "medindo desde 29/09, 16h". */
export function medindoDesde(iso: string): string {
  const hora = horaBR(iso);
  return hora === "00:00" ? `medindo desde ${diaMesBR(iso)}` : `medindo desde ${diaMesBR(iso)}, ${hora.slice(0, 2)}h`;
}

/** "1 clique", "12 cliques". */
export function contagem(n: number, [um, varios]: [string, string]): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

/**
 * "12 entraram e 3 saíram hoje; saldo +9. O pico foi 12h às 12h59, com 5." Com
 * parte do período antes da medição, diz desde quando conta. `onde` ("nos
 * grupos da loja") entra logo depois de `quando`; vazio, a frase não muda.
 */
export function fraseDoMovimento(barras: Barra[], m: Movimento, quando: string, desde: string | null, onde = ""): string {
  if (barras.every((b) => b.semMedicao)) return `Entradas e saídas ainda não eram medidas neste período (${desde}).`;
  const nota = desde ? ` (${desde})` : "";
  const local = onde ? ` ${onde}` : "";
  if (m.entraram + m.sairam === 0) return `Ninguém entrou nem saiu ${quando}${local}${nota}.`;
  const pico = barras.reduce((p, b) => (!b.semMedicao && b.valor > p.valor ? b : p), barras.find((b) => !b.semMedicao) ?? barras[0]);
  const base = `${contagem(m.entraram, unidadeDeEntradas)} e ${contagem(m.sairam, unidadeDeSaidas)} ${quando}${local}${nota}; saldo ${saldo(m.entraram - m.sairam)}.`;
  return pico.valor > 0 ? `${base} O pico foi ${pico.rotuloLongo}, com ${numero(pico.valor)}.` : base;
}
