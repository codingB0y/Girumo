import { parseFlag } from "@/lib/pages/flags";

/**
 * Casca "Vitrine Aberta" do painel do cliente
 * (docs/superpowers/specs/2026-09-07-painel-vitrine-aberta-design.md).
 *
 * Nasce DESLIGADA: fundir na main não muda o que a lojista vê. Cada tela migrada
 * (PRs 2 a 9) escolhe a casca por esta flag; no PR 10 a flag e a casca antiga saem.
 * A flag é por ambiente, não por tenant, pra não existir um caminho de código que
 * só um cliente enxerga.
 *
 * Ligar: NEXT_PUBLIC_PAINEL_VITRINE=on (só a string "on" liga, ver parseFlag).
 */
export function isPainelVitrineEnabled(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_PAINEL_VITRINE);
}
