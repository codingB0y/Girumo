import { z } from "zod";

/**
 * Só o que o motor lê. `z.object` descarta o resto (o contrato da Zernio
 * cresce sem aviso) e, por LGPD, nada do que fica aqui é o texto do post,
 * foto ou nome da pessoa: `text` do comentário/direct é lido para casar a
 * palavra e NUNCA gravado.
 */
const conta = z.object({ accountId: z.string().min(1) });

const comentarioRecebido = z.object({
  id: z.string().min(1),
  event: z.literal("comment.received"),
  comment: z.object({
    id: z.string().min(1),
    platformPostId: z.string().min(1),
    platform: z.string(),
    text: z.string().default(""),
    author: z.object({ id: z.string().min(1), username: z.string().optional(), isOwnAccount: z.boolean().optional() }),
    createdAt: z.string(),
    isReply: z.boolean().default(false),
  }),
  account: conta,
  timestamp: z.string(),
});

const mensagemRecebida = z.object({
  id: z.string().min(1),
  event: z.literal("message.received"),
  message: z.object({
    platformMessageId: z.string().min(1),
    platform: z.string(),
    direction: z.enum(["incoming", "outgoing"]),
    text: z.string().nullable().default(null),
    sender: z.object({ id: z.string().min(1), username: z.string().optional() }),
    sentAt: z.string(),
  }),
  conversation: z.object({ id: z.string().min(1), participantId: z.string().min(1) }),
  account: conta,
  metadata: z
    .object({
      storyReply: z.object({ storyId: z.string() }).optional(),
      quotedMessageId: z.string().optional(),
      postbackPayload: z.string().optional(),
    })
    .optional(),
  timestamp: z.string(),
});

const contaConectada = z.object({
  id: z.string().min(1),
  event: z.literal("account.connected"),
  account: z.object({ accountId: z.string().min(1), username: z.string().optional() }),
  timestamp: z.string(),
});

const contaDesconectada = z.object({
  id: z.string().min(1),
  event: z.literal("account.disconnected"),
  account: z.object({ accountId: z.string().min(1), disconnectionType: z.string().optional(), reason: z.string().optional() }),
  timestamp: z.string(),
});

const eventoZernio = z.discriminatedUnion("event", [comentarioRecebido, mensagemRecebida, contaConectada, contaDesconectada]);

export type EventoZernio = z.infer<typeof eventoZernio>;
export type ComentarioRecebido = z.infer<typeof comentarioRecebido>;
export type MensagemRecebida = z.infer<typeof mensagemRecebida>;
export type ContaConectada = z.infer<typeof contaConectada>;
export type ContaDesconectada = z.infer<typeof contaDesconectada>;

/** `null` = não é nosso (outro tipo de evento) ou fora do contrato: a rota responde 202 e esquece. */
export function lerEvento(json: unknown): EventoZernio | null {
  const r = eventoZernio.safeParse(json);
  return r.success ? r.data : null;
}
