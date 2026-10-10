import "server-only";

import { z } from "zod";

import { parseValorDoPedido } from "@/lib/orders/valor-do-pedido";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { toCents, type RpcItem, type SalesCaller } from "@/lib/stores/vendas";

/** Frases de tela (pt-BR). "phone" e "items" são as do mockup; "window", a da spec. */
export const MESSAGES = {
  phone: "Digite o número com DDD.",
  items: "Preencha nome, quantidade e valor de cada produto.",
  zeroTotal: "A venda precisa somar mais que zero.",
  contact: "Contato não encontrado.",
  window: "Passou de 24 horas: só o dono da loja corrige.",
  notFound: "Venda não encontrada.",
  month: "Mês inválido.",
  body: "Dados inválidos. Recarregue a página e tente de novo.",
  tooManySearches: "Muitas buscas seguidas. Espere um minuto e tente de novo.",
  tooManySales: "Muitas vendas seguidas. Espere um minuto e tente de novo.",
  failure: "Não deu para concluir agora. Tente de novo.",
} as const;

/** Teto de `order_items.unit_price` (check do PR 2). */
const MAX_UNIT_PRICE = 999_999.99;

const bodyItems = z
  .array(
    z.strictObject({
      nome: z.string().trim().min(1).max(120),
      quantidade: z.number().int().min(1).max(9999),
      valorUnitario: z.union([z.string(), z.number()]),
    }),
  )
  .min(1)
  .max(50);

export type BodyItems = z.infer<typeof bodyItems>;

/** POST /api/vendas (spec §3). */
export const saleBody = z
  .strictObject({
    leadId: z.uuid().optional(),
    telefone: z.string().max(30).optional(),
    nome: z.string().trim().max(80).optional(),
    itens: bodyItems,
  })
  .refine((body) => body.leadId !== undefined || body.telefone !== undefined, {
    message: MESSAGES.phone,
    path: ["telefone"],
  });

/** PATCH /api/vendas/[id]. */
export const correctionBody = z.strictObject({ itens: bodyItems });

/** A frase do 400 pelo primeiro campo que falhou. */
export function bodyErrorMessage(error: z.ZodError): string {
  switch (error.issues[0]?.path[0]) {
    case "itens":
      return MESSAGES.items;
    case "telefone":
      return MESSAGES.phone;
    case "leadId":
      return MESSAGES.contact;
    default:
      return MESSAGES.body;
  }
}

/**
 * Itens no formato da RPC, ou a frase do 400. "149,90" e 149.9 passam pelo
 * mesmo `parseValorDoPedido` da tela. Arredonda em centavos aqui para a
 * resposta bater com o numeric(12,2) gravado. Item de R$ 0 passa (brinde);
 * venda que soma zero, não (spec §6).
 */
export function itemsForRpc(items: BodyItems): { items: RpcItem[] } | { error: string } {
  const converted = items.map((item) => ({
    name: item.nome,
    quantity: item.quantidade,
    unit_price: toCents(parseValorDoPedido(item.valorUnitario)),
  }));
  if (converted.some((item) => !Number.isFinite(item.unit_price) || item.unit_price < 0 || item.unit_price > MAX_UNIT_PRICE)) {
    return { error: MESSAGES.items };
  }
  const total = toCents(converted.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  return total > 0 ? { items: converted } : { error: MESSAGES.zeroTotal };
}

/**
 * Quem chama, já passado pelo guard de módulo do PR 3 (roda dentro do
 * getRouteTenantContext): vendedora só chega aqui em rota de `vendas`.
 */
export async function getSalesCaller(req: Request): Promise<SalesCaller> {
  const ctx = await getRouteTenantContext(req, { allowEngine: false });
  // Com allowEngine false só sobra actor "user", que sempre traz authUserId e role; o tipo não sabe disso.
  if (!ctx.authUserId || !ctx.role) throw new Response("Tenant nao encontrado ou sem permissao.", { status: 403 });
  return { tenantId: ctx.tenantId, authUserId: ctx.authUserId, role: ctx.role };
}

/** As exceções das RPCs (contrato do PR 2) → status e frase de tela. */
const RPC_ERRORS = new Map<string, { status: number; error: string }>([
  ["itens_invalidos", { status: 400, error: MESSAGES.items }],
  ["total_zero", { status: 400, error: MESSAGES.zeroTotal }],
  ["fora_da_janela", { status: 403, error: MESSAGES.window }],
  ["pedido_nao_encontrado", { status: 404, error: MESSAGES.notFound }],
]);

/**
 * O miolo de toda rota de vendas. Response lançada (sessão, guard) sai como
 * veio; exceção de RPC vira a frase da tela; o resto é 500 sem a mensagem do
 * banco na resposta (ela vai pro log).
 */
export async function handleSalesErrors(route: () => Promise<Response>): Promise<Response> {
  try {
    return await route();
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : String(e);
    const known = RPC_ERRORS.get(message);
    if (known) return Response.json({ error: known.error }, { status: known.status });
    console.error("[vendas]", message);
    return Response.json({ error: MESSAGES.failure }, { status: 500 });
  }
}
