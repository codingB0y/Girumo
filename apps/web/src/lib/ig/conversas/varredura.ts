import "server-only";

import { InboxError, type InboxClient, type InboxConversation } from "@/lib/ig/zernio-inbox";
import { applyContact } from "@/lib/stores/ig-contacts";
import { getConversationByZernioId, hasTombstone, touchConversation, updateConversation } from "@/lib/stores/ig-conversations";

/** Primeira abertura e "Atualizar" (spec §7.11): importa as conversas da conta para o índice e as fichas. */

export const PAGINAS_MAX = 5;
const EM_PARALELO = 10;
const DIA_MS = 86_400_000;

export type ResultadoDaVarredura = { criadas: number; existentes: number; puladas: number; parcial: boolean };

type Conta = { id: string; accountId: string };

/** `true` = criou. Quem já está no índice fica como está (o webhook o mantém); quem foi apagada não volta. */
async function importar(tenantId: string, conta: Conta, c: InboxConversation, agora: Date): Promise<"criada" | "existente" | "pulada"> {
  if (await hasTombstone(tenantId, c.participantId)) return "pulada";
  if (await getConversationByZernioId(tenantId, c.id)) return "existente";
  const t = c.updatedTime ? Date.parse(c.updatedTime) : NaN;
  const em = new Date(Number.isFinite(t) ? Math.min(t, agora.getTime()) : agora.getTime());
  const conversa = await touchConversation(tenantId, {
    zernioConversationId: c.id,
    igUserId: c.participantId,
    igAccountId: conta.id,
    username: c.participantUsername,
    displayName: c.participantName,
    direction: "in",
    at: em.toISOString(),
    preview: c.lastMessage,
    // Resolvida, ou Aberta se a última mensagem tem menos de 24 h.
    status: agora.getTime() - em.getTime() < DIA_MS ? "open" : "resolved",
  });
  // `touch` em direção `in` soma 1 não lida; mensagem importada já foi lida na Zernio.
  if (conversa.unread_count > 0) await updateConversation(tenantId, conversa.id, { unread_count: 0 });
  // Sem `p_dm`: `last_dm_at` fica vazio até a conversa ser aberta ou ela escrever.
  await applyContact(tenantId, { igUserId: c.participantId, username: c.participantUsername, seenAt: em.toISOString(), dm: false });
  return "criada";
}

/**
 * Até 5 páginas de 100. Falha da Zernio na primeira página sobe como erro; depois dela devolve o que já
 * importou com `parcial`. `prazoMs` evita estourar o tempo da função com a Zernio lenta.
 */
export async function varrer(i: { tenantId: string; conta: Conta; client: InboxClient; agora?: Date; prazoMs?: number; relogio?: () => number }): Promise<ResultadoDaVarredura> {
  const agora = i.agora ?? new Date();
  const relogio = i.relogio ?? Date.now;
  const limite = relogio() + (i.prazoMs ?? 45_000);
  const r: ResultadoDaVarredura = { criadas: 0, existentes: 0, puladas: 0, parcial: false };
  let cursor: string | undefined;
  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    if (pagina > 0 && relogio() > limite) {
      r.parcial = true;
      break;
    }
    let lote;
    try {
      lote = await i.client.listConversations({ accountId: i.conta.accountId, cursor, limit: 100 });
    } catch (e) {
      if (pagina === 0 || !(e instanceof InboxError)) throw e;
      r.parcial = true;
      break;
    }
    for (let de = 0; de < lote.items.length; de += EM_PARALELO) {
      const resultados = await Promise.all(lote.items.slice(de, de + EM_PARALELO).map((c) => importar(i.tenantId, i.conta, c, agora)));
      for (const x of resultados) {
        if (x === "criada") r.criadas++;
        else if (x === "existente") r.existentes++;
        else r.puladas++;
      }
    }
    if (!lote.nextCursor) break;
    cursor = lote.nextCursor;
    if (pagina === PAGINAS_MAX - 1) r.parcial = true;
  }
  return r;
}
