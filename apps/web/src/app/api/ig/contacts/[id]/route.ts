import { z } from "zod";
import { requirePessoas } from "@/lib/ig/access";
import { zernioDaLoja } from "@/lib/ig/conversas/http";
import { isUuid } from "@/lib/ig/flow/body";
import { FIELD_KEY_RE } from "@/lib/ig/flow/names";
import { invalido, naoAchou, nomesDosFluxos, normalizarEtiquetas, paraAtendimento, paraPessoa, responderErro } from "@/lib/ig/pessoas-http";
import type { FichaDaPessoa } from "@/lib/ig/pessoas-tipos";
import { InboxError } from "@/lib/ig/zernio-inbox";
import { getAccount } from "@/lib/stores/ig-accounts";
import { deleteContact, getContactById } from "@/lib/stores/ig-contacts";
import { editContact } from "@/lib/stores/ig-contacts-lista";
import { addTombstone, deleteConversationsOf, listConversationsOf } from "@/lib/stores/ig-conversations";
import { listRunsOfUser } from "@/lib/stores/ig-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_CAMPOS_POR_EDICAO = 30;
// Valor acima de 200 caracteres a função SQL corta; aqui recusa, para a tela avisar em vez de gravar pela metade.
const valorDoCampo = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);
const editarSchema = z
  .object({
    set: z.record(z.string().regex(FIELD_KEY_RE), valorDoCampo).refine((s) => Object.keys(s).length <= MAX_CAMPOS_POR_EDICAO).optional(),
    add: z.array(z.string().max(80)).max(50).optional(),
    remove: z.array(z.string().max(80)).max(50).optional(),
  })
  .refine((b) => b.set !== undefined || b.add?.length || b.remove?.length);

// GET /api/ig/contacts/[id] — a ficha e os atendimentos (ig_runs) dela. Id de outra loja = 404.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { ctx } = await requirePessoas(req, "ler");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const contato = await getContactById(ctx.tenantId, id);
    if (!contato) return naoAchou();
    const [runs, fluxos] = await Promise.all([listRunsOfUser(ctx.tenantId, contato.ig_user_id), nomesDosFluxos(ctx.tenantId)]);
    const corpo: FichaDaPessoa = { pessoa: paraPessoa(contato, fluxos), atendimentos: runs.map((r) => paraAtendimento(r, fluxos)) };
    return Response.json(corpo);
  } catch (e) {
    return responderErro(e);
  }
}

// PATCH /api/ig/contacts/[id] — { set: { campo: valor | null }, add: [etiqueta], remove: [etiqueta] }.
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { ctx } = await requirePessoas(req, "escrever");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const parsed = editarSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalido();
    const add = normalizarEtiquetas(parsed.data.add ?? []);
    const remove = normalizarEtiquetas(parsed.data.remove ?? []);
    if (!add || !remove) return Response.json({ error: "Etiqueta inválida: use letras, números e hífen." }, { status: 400 });
    const contato = await getContactById(ctx.tenantId, id);
    if (!contato) return naoAchou();
    const nova = await editContact(ctx.tenantId, contato, { set: parsed.data.set, add, remove });
    if (!nova) return naoAchou();
    return Response.json({ pessoa: paraPessoa(nova, await nomesDosFluxos(ctx.tenantId)) });
  } catch (e) {
    return responderErro(e);
  }
}

// DELETE /api/ig/contacts/[id] — "Apagar da lista": a ficha, os atendimentos, o índice de conversas e a cópia na Zernio. Só dono ou admin.
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { ctx } = await requirePessoas(req, "apagar");
    const { id } = await params;
    if (!isUuid(id)) return naoAchou();
    const contato = await getContactById(ctx.tenantId, id);
    if (!contato) return naoAchou();
    // LGPD: lê os ids das conversas ANTES de apagar qualquer coisa e pede a exclusão da cópia na Zernio primeiro;
    // se o banco falhar no meio, o reenvio ainda acha os ids. Falha da Zernio não é erro: a resposta avisa que a cópia ficou.
    const conversas = await listConversationsOf(ctx.tenantId, contato.ig_user_id);
    const copiaNaZernio = await apagarCopiasNaZernio(ctx.tenantId, conversas);
    // Marcador (a varredura não traz a pessoa de volta), depois o índice, depois a ficha e os atendimentos.
    await addTombstone(ctx.tenantId, contato.ig_user_id);
    await deleteConversationsOf(ctx.tenantId, contato.ig_user_id);
    await deleteContact(ctx.tenantId, id);
    return Response.json({ ok: true, copiaNaZernio });
  } catch (e) {
    return responderErro(e);
  }
}

/**
 * `true` = alguma cópia ficou na Zernio (sem conta, conta que não é a da conversa, sem chave ou erro dela). Cada conversa
 * é apagada com a conta DELA (`ig_account_id` da linha); só há uma conta por loja, então conversa de outra conta não se alcança.
 * 404 da Zernio conta como apagada porque a conta é a da conversa.
 */
async function apagarCopiasNaZernio(tenantId: string, conversas: Array<{ zernioConversationId: string; igAccountId: string | null }>): Promise<boolean> {
  if (conversas.length === 0) return false;
  try {
    const conta = await getAccount(tenantId);
    if (!conta?.provider_account_id) return true;
    const accountId = conta.provider_account_id;
    const alcancaveis = conversas.filter((c) => c.igAccountId === null || c.igAccountId === conta.id);
    const zernio = zernioDaLoja();
    const resultados = await Promise.allSettled(alcancaveis.map((c) => zernio.deleteConversation({ conversationId: c.zernioConversationId, accountId })));
    const falhou = resultados.some((r) => r.status === "rejected" && !(r.reason instanceof InboxError && r.reason.kind === "not_found"));
    return falhou || alcancaveis.length < conversas.length;
  } catch {
    return true;
  }
}
