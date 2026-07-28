/**
 * Normaliza participantes de um evento `group-participants.update`.
 *
 * Regra central herdada da engine e do webhook-schema da F2: um `@lid` NÃO
 * carrega telefone real — a parte antes do `@` é um id interno do WhatsApp, e
 * devolvê-la como número inventaria um telefone. Por isso o domínio é conferido
 * explicitamente (`s.whatsapp.net`), não só o formato dos dígitos.
 *
 * A Evolution entrega o telefone verdadeiro no campo `phoneNumber`
 * (`<numero>@s.whatsapp.net`) ao lado do `id` `@lid`. Ver as fixtures reais em
 * apps/web/src/lib/evolution/__fixtures__/group-participants-update.*.json.
 */

const WHATSAPP_DOMAIN = "s.whatsapp.net";

export type RawParticipant = {
  id?: string | null;
  phoneNumber?: string | null;
  admin?: string | null;
};

export type NormalizedParticipant = {
  /** Só dígitos, ou `null` quando veio como `@lid` sem telefone. Nunca inventado. */
  phone: string | null;
  /** JID/LID original preservado para rastro (`source`/debug), nunca como telefone. */
  jid: string | null;
};

/**
 * `5511999990001@s.whatsapp.net` → `5511999990001`.
 *
 * Devolve `null` para `@lid`, domínio ausente/diferente, ou dígitos fora da
 * faixa de um telefone (8–15). O sufixo de device (`:12`) é removido antes.
 */
export function phoneFromJid(value: string | null | undefined): string | null {
  if (!value) return null;
  const [user, domain] = String(value).split("@");
  if (domain !== WHATSAPP_DOMAIN) return null;
  const withoutDevice = (user ?? "").split(":")[0] ?? "";
  const digits = withoutDevice.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/**
 * Extrai o telefone de um participante.
 *
 * `phoneNumber` é a fonte confiável; caímos para `id` só se ele próprio for um
 * `@s.whatsapp.net` (raro, mas possível). Se nenhum dos dois resolve para um
 * telefone real, `phone` é `null` — e o lead entra assim mesmo, porque a entrada
 * no grupo é o fato; o número pode aparecer depois.
 */
export function normalizeParticipant(participant: RawParticipant): NormalizedParticipant {
  const phone = phoneFromJid(participant.phoneNumber) ?? phoneFromJid(participant.id);
  const jid = participant.id ?? participant.phoneNumber ?? null;
  return { phone, jid };
}
