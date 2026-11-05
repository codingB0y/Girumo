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
import { addTombstone, deleteConversationsOf } from "@/lib/stores/ig-conversations";
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
    // Marcador antes de tudo (o "Atualizar" não traz a pessoa de volta), depois o índice, depois a ficha e os atendimentos.
    await addTombstone(ctx.tenantId, contato.ig_user_id);
    const conversas = await deleteConversationsOf(ctx.tenantId, contato.ig_user_id);
    await deleteContact(ctx.tenantId, id);
    // A pessoa já sumiu da Girumo. Falha ao apagar a cópia na Zernio não é erro: a resposta avisa que ela ficou.
    // ponytail: se `deleteContact` cair aqui, o reenvio acha a ficha mas já não acha os ids da Zernio; apagar à mão no painel dela.
    return Response.json({ ok: true, copiaNaZernio: await apagarCopiasNaZernio(ctx.tenantId, conversas) });
  } catch (e) {
    return responderErro(e);
  }
}

/** `true` = alguma cópia ficou na Zernio (sem conta conectada, sem chave ou erro dela). */
async function apagarCopiasNaZernio(tenantId: string, conversas: Array<{ zernioConversationId: string }>): Promise<boolean> {
  if (conversas.length === 0) return false;
  try {
    const conta = await getAccount(tenantId);
    if (!conta?.provider_account_id) return true;
    const zernio = zernioDaLoja();
    const resultados = await Promise.allSettled(conversas.map((c) => zernio.deleteConversation({ conversationId: c.zernioConversationId, accountId: conta.provider_account_id as string })));
    // 404 = a cópia já não existe: conta como apagada.
    return resultados.some((r) => r.status === "rejected" && !(r.reason instanceof InboxError && r.reason.kind === "not_found"));
  } catch {
    return true;
  }
}
