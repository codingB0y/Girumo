import { jidDigits } from "@/lib/evolution/admin-group";
import type { ParticipantLike } from "@/lib/groups/admin-protection";

/**
 * Quanto a contagem de membros muda com um `group-participants.update`.
 *
 * Só `add` e `remove` mexem no tamanho do grupo. `promote` e `demote` trocam o
 * papel de quem já está dentro — quem os tratasse como entrada/saída inflaria a
 * contagem toda vez que um admin fosse nomeado.
 *
 * Deduplica por participante porque a Evolution repete o mesmo número no array
 * quando o evento chega em lote, e cada repetição contaria de novo.
 *
 * Isto é o oposto de uma medição: é notícia de uma mudança, aplicada sobre a
 * última contagem conhecida. Um evento perdido (Evolution reiniciando, deploy,
 * rede) nunca se corrige sozinho — só o próximo sync completo recalibra. É o
 * preço de ter o número vivo, e a razão de a tela continuar mostrando há quanto
 * tempo houve conferência de verdade.
 */
export function memberCountDelta(
  action: string,
  participants: ParticipantLike[] | null | undefined,
): number {
  const normalized = String(action ?? "").toLowerCase();
  if (normalized !== "add" && normalized !== "remove") return 0;

  const vistos = new Set<string>();
  for (const p of participants ?? []) {
    const chave = jidDigits(p?.id) || jidDigits(p?.phoneNumber) || String(p?.id ?? "");
    if (chave) vistos.add(chave);
  }

  // Sai cedo no zero para não devolver `-0`: ele sobrevive até o corpo do
  // POST e deixa um `-0` no log, que só faz quem lê duvidar do número.
  if (vistos.size === 0) return 0;
  return normalized === "add" ? vistos.size : -vistos.size;
}
