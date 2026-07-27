import { z } from "zod";

/**
 * Contrato dos webhooks da Evolution API v2.3.7.
 *
 * Escrito contra payloads REAIS capturados na F1 (`./__fixtures__/`), não contra
 * a documentação. Dois achados que moldam este arquivo:
 *
 * 1. O campo `event` NÃO usa o nome configurado no `webhook/set`. Configura-se
 *    `CONNECTION_UPDATE` e chega `connection.update`. O discriminador usa os
 *    valores com ponto.
 * 2. Todo payload carrega `apikey` (token da instância). É credencial: o
 *    receiver remove antes de persistir ou logar qualquer coisa.
 *
 * Objetos são `looseObject` de propósito. O payload cru vai para
 * `engine_events.payload` e é consumido pelo worker (F3/F4) — descartar chaves
 * desconhecidas aqui perderia dado que ainda não sabemos usar. Validamos o que
 * lemos; preservamos o resto.
 */

/** Estados de conexão conhecidos. Ver `mapConnectionState` para o mapeamento. */
export const CONNECTION_STATE_OPEN = "open";
export const CONNECTION_STATE_CONNECTING = "connecting";
export const CONNECTION_STATE_CLOSE = "close";

/**
 * Envelope comum a todos os eventos, mesclado em cada membro da união.
 *
 * Mesclado (e não `union.and(envelope)`) porque uma intersection sobre união
 * atrapalha o narrowing pelo discriminador — com o shape embutido, um
 * `switch (event.event)` estreita `data` corretamente.
 *
 * `sender` é opcional: `qrcode.updated` chega sem ele (ainda não há sessão).
 * `apikey` é declarado para que o receiver possa removê-lo explicitamente —
 * nunca é persistido.
 */
const envelopeShape = {
  instance: z.string().min(1),
  date_time: z.string().min(1),
  destination: z.string().optional(),
  sender: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),
};

const qrcodeUpdated = z.object({
  ...envelopeShape,
  event: z.literal("qrcode.updated"),
  data: z.looseObject({
    qrcode: z.looseObject({
      // `code` é o payload de pareamento (`2@...`) renderizado localmente pelo
      // qrcode.react. `base64` é o PNG pronto da Evolution — não usamos, para
      // não trafegar imagem à toa nem depender do render deles.
      code: z.string().min(1),
      base64: z.string().optional(),
      pairingCode: z.string().nullable().optional(),
    }),
  }),
});

const connectionUpdate = z.object({
  ...envelopeShape,
  event: z.literal("connection.update"),
  data: z.looseObject({
    // Deliberadamente `string`, não enum: um estado novo numa versão futura
    // viraria 400 e faria a Evolution reentregar em loop. `mapConnectionState`
    // trata desconhecido sem mexer no status da instância.
    state: z.string().min(1),
    // `<numero>@s.whatsapp.net` — só presente quando a conexão abre.
    wuid: z.string().nullable().optional(),
    statusReason: z.number().nullable().optional(),
  }),
});

const groupParticipant = z.looseObject({
  // Pode ser `<numero>@s.whatsapp.net` OU `<digitos>@lid` (sem telefone real).
  id: z.string().min(1),
  phoneNumber: z.string().nullable().optional(),
  admin: z.string().nullable().optional(),
});

const groupParticipantsUpdate = z.object({
  ...envelopeShape,
  event: z.literal("group-participants.update"),
  data: z.looseObject({
    id: z.string().min(1),
    // add | remove | promote | demote. String pelo mesmo motivo de `state`.
    action: z.string().min(1),
    participants: z.array(groupParticipant).min(1),
    author: z.string().nullable().optional(),
  }),
});

const groupsUpsert = z.object({
  ...envelopeShape,
  event: z.literal("groups.upsert"),
  // Único evento cujo `data` é array.
  data: z
    .array(
      z.looseObject({
        id: z.string().min(1),
        // Nome de grupo é input de atacante: nunca interpolar em HTML.
        subject: z.string().optional(),
        size: z.number().optional(),
      }),
    )
    .min(1),
});

const messagesUpdate = z.object({
  ...envelopeShape,
  event: z.literal("messages.update"),
  data: z.looseObject({
    keyId: z.string().min(1),
    // READ | DELIVERY_ACK | SERVER_ACK | PLAYED | PENDING | ERROR...
    status: z.string().min(1),
    remoteJid: z.string().optional(),
    fromMe: z.boolean().optional(),
    messageId: z.string().optional(),
  }),
});

export const evolutionWebhookSchema = z.discriminatedUnion("event", [
  qrcodeUpdated,
  connectionUpdate,
  groupParticipantsUpdate,
  groupsUpsert,
  messagesUpdate,
]);

export type EvolutionWebhookEvent = z.infer<typeof evolutionWebhookSchema>;
export type EvolutionEventName = EvolutionWebhookEvent["event"];

export type ParseResult =
  | { ok: true; event: EvolutionWebhookEvent }
  | { ok: false; error: string };

/**
 * Valida um payload cru. Nunca lança e nunca devolve o payload no erro — a
 * mensagem de erro vai para log e o payload contém credencial.
 */
export function parseEvolutionWebhook(payload: unknown): ParseResult {
  const result = evolutionWebhookSchema.safeParse(payload);
  if (result.success) return { ok: true, event: result.data };

  const issue = result.error.issues[0];
  const path = issue?.path.join(".") || "(root)";
  return { ok: false, error: `${path}: ${issue?.message ?? "payload inválido"}` };
}

/**
 * Remove a credencial do payload antes de persistir em `engine_events` ou
 * `logs`. Ver README.evolution.md — "nunca logar o payload cru".
 */
export function stripCredentials<T extends Record<string, unknown>>(
  payload: T,
): Omit<T, "apikey"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apikey, ...safe } = payload;
  return safe;
}

/** Status de `instances` correspondente, ou `null` se o estado for desconhecido. */
export function mapConnectionState(state: string): "connected" | "connecting" | "disconnected" | null {
  if (state === CONNECTION_STATE_OPEN) return "connected";
  if (state === CONNECTION_STATE_CONNECTING) return "connecting";
  if (state === CONNECTION_STATE_CLOSE) return "disconnected";
  return null;
}

/**
 * `5511999990001@s.whatsapp.net` → `5511999990001`.
 *
 * Um `@lid` NÃO carrega telefone real — a parte antes do `@` é um id interno do
 * WhatsApp e devolvê-la como número inventaria um telefone. Por isso o domínio
 * é verificado explicitamente, e não só o formato dos dígitos.
 */
export function phoneFromWuid(wuid: string | null | undefined): string | null {
  if (!wuid) return null;
  const [user, domain] = wuid.split("@");
  if (domain !== "s.whatsapp.net") return null;
  return /^\d{8,15}$/.test(user ?? "") ? user : null;
}
