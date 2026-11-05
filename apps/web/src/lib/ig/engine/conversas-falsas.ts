import type { Conversas } from "@/lib/ig/conversas/indice";
import type { AtualizarConversa } from "@/lib/ig/conversas/passar-pra-loja";
import type { ConversationEventInput, ConversationPatch, IgConversationRow, TouchInput } from "@/lib/stores/ig-conversations";

/**
 * Índice das Conversas dos testes do motor, em memória, com a mesma regra do `ig_conversation_touch`:
 * soma não lida só em `in`, a última mensagem só anda para frente, `status` null mantém. Sem "server-only".
 */
export function criarConversasFalsas(opts: { inicial?: Partial<IgConversationRow> & { ig_user_id: string }; falharTocar?: boolean; falharEvento?: boolean; falharAtualizar?: boolean } = {}) {
  const linhas = new Map<string, IgConversationRow>();
  const toques: TouchInput[] = [];
  const eventos: ConversationEventInput[] = [];
  const ultimas = new Map<string, string>();
  const atualizacoes: Array<{ id: string; patch: ConversationPatch }> = [];
  if (opts.inicial) linhas.set(opts.inicial.ig_user_id, { ...vazia(opts.inicial.ig_user_id), ...opts.inicial });

  const conversas: Conversas = {
    async ler(tenantId, igUserId) {
      const l = linhas.get(igUserId);
      return l && l.tenant_id === tenantId ? l : null;
    },
    async tocar(tenantId, input) {
      toques.push(input);
      if (opts.falharTocar) throw new Error("ig_conversation_touch fora do ar");
      const atual = linhas.get(input.igUserId) ?? { ...vazia(input.igUserId), tenant_id: tenantId, zernio_conversation_id: input.zernioConversationId, status: input.status ?? "open" };
      // Mesma regra do banco: a mesma mensagem recebida de novo não muda nada.
      if (input.direction === "in" && input.messageId && ultimas.get(input.igUserId) === input.messageId && linhas.has(input.igUserId)) {
        const mantida = input.status ? { ...atual, status: input.status } : atual;
        linhas.set(input.igUserId, mantida);
        return mantida;
      }
      if (input.direction === "in" && input.messageId) ultimas.set(input.igUserId, input.messageId);
      const frente = !atual.last_message_at || Date.parse(input.at) >= Date.parse(atual.last_message_at);
      const row: IgConversationRow = {
        ...atual,
        status: input.status ?? atual.status,
        unread_count: atual.unread_count + (input.direction === "in" ? 1 : 0),
        last_direction: frente ? input.direction : atual.last_direction,
        last_preview: frente ? input.preview : atual.last_preview,
        last_message_at: frente ? input.at : atual.last_message_at,
      };
      linhas.set(input.igUserId, row);
      return row;
    },
    async evento(_tenantId, e) {
      if (opts.falharEvento) throw new Error("ig_conversation_events fora do ar");
      eventos.push(e);
    },
  };
  /** O `updateConversation` da store, em memória. */
  const atualizar: AtualizarConversa = async (tenantId, id, patch) => {
    atualizacoes.push({ id, patch });
    if (opts.falharAtualizar) throw new Error("ig_conversations fora do ar");
    const alvo = [...linhas.values()].find((l) => l.id === id && l.tenant_id === tenantId);
    if (!alvo) return null;
    const nova = { ...alvo, ...patch };
    linhas.set(alvo.ig_user_id, nova);
    return nova;
  };
  return { conversas, atualizar, atualizacoes, toques, eventos, linhas };
}

function vazia(igUserId: string): IgConversationRow {
  return { id: `conv-${igUserId}`, tenant_id: "loja-a", ig_account_id: "a1", zernio_conversation_id: "conv-1", ig_user_id: igUserId, username: null, display_name: null, status: "open", folder: "inbox", unread_count: 0, last_message_at: null, last_direction: null, last_preview: null, bot_paused_until: null, updated_at: "2026-10-06T11:00:00Z" };
}
