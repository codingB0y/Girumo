import "server-only";

import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { zernioApiKey } from "@/lib/ig/segredos";
import { createZernioInbox, InboxError, type InboxClient } from "@/lib/ig/zernio-inbox";
import { getAccount } from "@/lib/stores/ig-accounts";
import { getConversationById, type IgConversationRow } from "@/lib/stores/ig-conversations";
import type { TenantContext } from "@/lib/supabase/tenant-context";
import type { ConversaDto } from "./tipos";

/** Pedaços compartilhados pelas rotas `/api/ig/conversations/*` e `/api/ig/canned-replies/*`. */

/**
 * Sessão + add-on ligado, e nunca vendedora (spec §8). `admin: true` = só dono ou admin (respostas prontas).
 * Diferente de Pessoas, depois de cancelar o add-on as Conversas fecham (como os Fluxos).
 */
export async function requireConversas(req: Request, opcoes: { admin?: boolean } = {}): Promise<TenantContext> {
  const ctx = await requireInstagram(req);
  if (ctx.role === "seller") throw Response.json({ error: "Sem permissão para esta ação.", code: "forbidden" }, { status: 403 });
  if (opcoes.admin && ctx.role !== "owner" && ctx.role !== "admin") throw Response.json({ error: "Só o dono ou o administrador faz isso.", code: "forbidden" }, { status: 403 });
  return ctx;
}

export const zernioDaLoja = (): InboxClient => createZernioInbox({ apiKey: zernioApiKey() });

export const naoAchouConversa = (): Response => Response.json({ error: "Conversa não encontrada." }, { status: 404 });
export const corpoInvalido = (): Response => Response.json({ error: "Corpo inválido." }, { status: 400 });

/** A conta do Instagram da loja, conectada e ativa; senão 409 `sem_conta`. */
export async function carregarConta(tenantId: string): Promise<{ id: string; accountId: string }> {
  const conta = await getAccount(tenantId);
  if (!conta || conta.status !== "active" || !conta.provider_account_id) throw Response.json({ error: "A conta do Instagram não está conectada.", code: "sem_conta" }, { status: 409 });
  return { id: conta.id, accountId: conta.provider_account_id };
}

/**
 * A linha é da loja, a conta do Instagram é a que está conectada e é a mesma da conversa. Só o servidor sabe o
 * `zernio_conversation_id` e o id da conta na Zernio: nada disso vem do navegador.
 */
export async function carregarConversa(tenantId: string, id: string): Promise<{ conversa: IgConversationRow; accountId: string }> {
  if (!isUuid(id)) throw naoAchouConversa();
  const conversa = await getConversationById(tenantId, id);
  if (!conversa) throw naoAchouConversa();
  const conta = await carregarConta(tenantId);
  if (conversa.ig_account_id && conversa.ig_account_id !== conta.id) throw Response.json({ error: "Esta conversa é de outra conta do Instagram.", code: "conta_trocada" }, { status: 409 });
  return { conversa, accountId: conta.accountId };
}

/** O prazo da pausa só aparece enquanto vale. */
export const pausaVigente = (c: IgConversationRow, agora: Date): string | null => (c.bot_paused_until && Date.parse(c.bot_paused_until) > agora.getTime() ? c.bot_paused_until : null);

export function paraConversa(c: IgConversationRow, agora: Date): ConversaDto {
  return {
    id: c.id,
    username: c.username,
    nome: c.display_name,
    situacao: c.status,
    pedido: c.folder === "requests",
    naoLidas: c.unread_count,
    ultimaEm: c.last_message_at,
    ultimaDirecao: c.last_direction,
    previa: c.last_preview,
    roboPausadoAte: pausaVigente(c, agora),
  };
}

/**
 * `Response` lançada pelas guardas sai como está; erro da Zernio vira resposta sem repetir `message` nem
 * `details` dela (o texto pode ter dado da conta); o resto estoura (500 com log).
 */
export function responderErroConversa(e: unknown): Response {
  if (e instanceof Response) return e;
  if (!(e instanceof InboxError)) throw e;
  switch (e.kind) {
    case "rate_limited": {
      const espera = e.retryAfterSeconds ?? 60;
      return Response.json({ error: "Muitas chamadas ao Instagram. Tente de novo em instantes.", code: "zernio_rate_limited", retryAfter: espera }, { status: 429, headers: { "Retry-After": String(espera) } });
    }
    case "not_found":
      return Response.json({ error: "A conversa não existe mais no Instagram.", code: "zernio_nao_achou" }, { status: 404 });
    case "conflict":
      return Response.json({ error: "O Instagram não aceitou o envio agora.", code: "zernio_conflito" }, { status: 409 });
    case "invalid":
      return Response.json({ error: "O Instagram recusou a mensagem.", code: "zernio_recusou" }, { status: 422 });
    case "auth":
      return Response.json({ error: "A conexão com o Instagram precisa ser refeita.", code: "zernio_auth" }, { status: 502 });
    case "config":
    case "network":
      return Response.json({ error: "O Instagram não respondeu. Tente de novo.", code: "zernio_fora" }, { status: 503 });
    default:
      return Response.json({ error: "O Instagram está fora do ar. Tente de novo em alguns minutos.", code: "zernio_erro" }, { status: 502 });
  }
}
