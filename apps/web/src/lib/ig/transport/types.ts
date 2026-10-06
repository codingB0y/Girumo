/**
 * O que o motor pede ao transporte. Duas implementações desde o primeiro dia:
 * a da Zernio (`zernio.ts`) e a falsa dos testes (`fake.ts`). Trocar de
 * fornecedor é escrever outra implementação deste tipo.
 */
export type PrivateReplyInput = { accountId: string; platformPostId: string; commentId: string; message: string; idempotencyKey: string };
export type PublicReplyInput = { accountId: string; platformPostId: string; commentId: string; message: string; idempotencyKey: string };
export type ConversationMessageInput = { accountId: string; conversationId: string; message: string; idempotencyKey: string };
export type ZernioAccount = { id: string; username: string; isActive: boolean; needsReconnection: boolean };

export type Transport = {
  /** Garante o perfil da loja na Zernio e devolve o id (cria, ou reaproveita no 409). */
  ensureProfile(name: string): Promise<string>;
  /** URL da Zernio para onde o navegador da loja vai autorizar. */
  connectUrl(profileId: string, redirectUrl: string): Promise<string>;
  listAccounts(profileId: string): Promise<ZernioAccount[]>;
  deleteAccount(accountId: string): Promise<void>;
  privateReply(input: PrivateReplyInput): Promise<void>;
  publicReply(input: PublicReplyInput): Promise<void>;
  sendMessage(input: ConversationMessageInput): Promise<void>;
};

/** Envelope de erro da Zernio (`{ error, type, code, details }`). `status` 0 = rede ou timeout. */
export class ZernioError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly code: string,
    readonly details: Record<string, unknown> | null,
    message: string,
  ) {
    super(message);
    this.name = "ZernioError";
  }

  /** A única resposta privada deste comentário já saiu: tratar como enviado, nunca repetir. */
  get privateReplyConsumed(): boolean {
    return this.details?.privateReplyConsumed === true;
  }

  /** Vale deixar a Zernio reenviar o evento (rede, timeout, 429, 5xx). */
  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}
