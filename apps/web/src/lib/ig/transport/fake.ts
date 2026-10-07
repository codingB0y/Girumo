import type { ConversationMessageInput, PrivateReplyInput, PublicReplyInput, Transport, ZernioAccount, ZernioError } from "./types";

export type Chamada =
  | { metodo: "ensureProfile"; args: string }
  | { metodo: "connectUrl"; args: { profileId: string; redirectUrl: string } }
  | { metodo: "listAccounts"; args: string }
  | { metodo: "deleteAccount"; args: string }
  | { metodo: "privateReply"; args: PrivateReplyInput }
  | { metodo: "publicReply"; args: PublicReplyInput }
  | { metodo: "sendMessage"; args: ConversationMessageInput };

/**
 * Transporte dos testes: grava cada chamada e, por método, lança o erro
 * combinado em `falhar` (uma vez por chamada, sempre). Sem "server-only" de
 * propósito: os testes do motor importam daqui.
 */
export function createFakeTransport(opts: { falhar?: Partial<Record<Chamada["metodo"], ZernioError>>; contas?: ZernioAccount[] } = {}) {
  const chamadas: Chamada[] = [];
  const registra = (c: Chamada) => {
    chamadas.push(c);
    const erro = opts.falhar?.[c.metodo];
    if (erro) throw erro;
  };
  const transport: Transport = {
    async ensureProfile(name) {
      registra({ metodo: "ensureProfile", args: name });
      return "perfil-falso";
    },
    async connectUrl(profileId, redirectUrl) {
      registra({ metodo: "connectUrl", args: { profileId, redirectUrl } });
      return "https://zernio.falso/autorizar";
    },
    async listAccounts(profileId) {
      registra({ metodo: "listAccounts", args: profileId });
      return opts.contas ?? [];
    },
    async deleteAccount(accountId) {
      registra({ metodo: "deleteAccount", args: accountId });
    },
    async privateReply(i) {
      registra({ metodo: "privateReply", args: i });
    },
    async publicReply(i) {
      registra({ metodo: "publicReply", args: i });
    },
    async sendMessage(i) {
      registra({ metodo: "sendMessage", args: i });
    },
  };
  return { transport, chamadas };
}
