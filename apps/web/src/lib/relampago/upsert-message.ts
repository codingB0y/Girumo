export type UpsertMessage = {
  remoteJid: string;
  messageId: string;
  /** Como chegou: @lid ou @s.whatsapp.net. Guardado cru. */
  participantJid: string;
  /** Telefone quando a Evolution mandou ao lado do lid. null nunca vira palpite. */
  phoneHint: string | null;
  pushName: string | null;
  text: string;
  /** Do WhatsApp, não do nosso relógio. É o que ordena a fila. */
  commentedAt: Date;
};

function soDigitos(jid: unknown): string | null {
  if (typeof jid !== "string" || !jid) return null;
  const [user, dominio] = jid.split("@");
  if (dominio !== "s.whatsapp.net") return null;
  return /^\d{8,15}$/.test(user ?? "") ? user : null;
}

/**
 * Extrai de um `messages.upsert` o que a fila precisa. `null` quando a mensagem
 * não serve (sem texto, sem autor).
 *
 * Lê `participantAlt`/`participantPn`/`senderPn` porque em produção 100% dos
 * participantes chegam como `@lid`, e esses campos são a única chance de ter o
 * telefone sem consultar o mapa. Medido em 01/09/2026 sobre engine_events.
 */
export function parseUpsertMessage(data: unknown): UpsertMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const key = d.key as Record<string, unknown> | undefined;
  if (!key) return null;

  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  const messageId = typeof key.id === "string" ? key.id : "";
  const participantJid = typeof key.participant === "string" ? key.participant : "";
  if (!remoteJid || !messageId || !participantJid) return null;

  const message = d.message as Record<string, unknown> | null | undefined;
  const conversation = typeof message?.conversation === "string" ? message.conversation : null;
  const estendida = message?.extendedTextMessage as Record<string, unknown> | undefined;
  const texto = conversation ?? (typeof estendida?.text === "string" ? estendida.text : null);
  if (!texto || !texto.trim()) return null;

  const carimbo = d.messageTimestamp;
  const segundos = typeof carimbo === "number" ? carimbo : Number(carimbo);
  if (!Number.isFinite(segundos) || segundos <= 0) return null;

  const phoneHint =
    soDigitos(key.participantAlt) ??
    soDigitos(key.participantPn) ??
    soDigitos(key.senderPn) ??
    soDigitos(participantJid);

  return {
    remoteJid,
    messageId,
    participantJid,
    phoneHint,
    pushName: typeof d.pushName === "string" ? d.pushName : null,
    text: texto,
    commentedAt: new Date(segundos * 1000),
  };
}
