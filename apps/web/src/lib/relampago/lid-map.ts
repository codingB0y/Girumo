/**
 * Mapa `@lid` -> telefone.
 *
 * Existe porque em produção 100% dos participantes chegam como `@lid`, sem o
 * telefone ao lado no `messages.upsert` (medido em 01/09/2026 sobre 4.121
 * participantes em engine_events). Sem o mapa, a fila mostra o comentário e não
 * há como chamar ninguém.
 *
 * O mapa não cobre todo mundo: ~13% de quem entra no grupo chega sem
 * `phoneNumber` pela mesma API que o alimenta. Quem ficar de fora fica com
 * `phone = null`, e a tela oferece responder no grupo. Nunca um número inventado.
 */

type ParticipantLike = { id?: string | null; phoneNumber?: string | null };

function telefoneValido(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digitos) ? digitos : null;
}

/** Do `fetchAllGroups(getParticipants=true)`. Entradas sem telefone são omitidas. */
export function lidMapFromParticipants(group: {
  participants?: ParticipantLike[];
}): Record<string, string> {
  const mapa: Record<string, string> = {};

  for (const p of group.participants ?? []) {
    if (!p?.id) continue;
    const fone = telefoneValido(p.phoneNumber) ?? telefoneValido(p.id.split("@")[0]);
    if (fone) mapa[p.id] = fone;
  }

  return mapa;
}

/** Mescla vários mapas. O PRIMEIRO argumento tem precedência. */
export function mergeLidMaps(...mapas: Array<Record<string, string>>): Record<string, string> {
  const saida: Record<string, string> = {};

  for (const mapa of mapas) {
    for (const [jid, fone] of Object.entries(mapa)) {
      if (jid in saida) continue;
      const valido = telefoneValido(fone);
      if (valido) saida[jid] = valido;
    }
  }

  return saida;
}
