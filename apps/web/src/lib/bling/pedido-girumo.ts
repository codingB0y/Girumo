import "server-only";

import { createHash } from "node:crypto";

import { recordOrder } from "@/lib/orders/registrar";
import { toCents, type SaleLead } from "@/lib/stores/vendas";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { TipoPedido } from "./tipos";

/**
 * Projeção do pedido do Bling em `orders` (spec 2026-10-13-integracao-bling §1
 * "Pedido na Girumo"). A venda entra em `orders` com `source = 'bling'` e o funil
 * de anúncios, o Resultados e o "comprou" do lead passam a contar sozinhos.
 *
 * Mexe só em pedido com `source = 'bling'`: o id vem de `bling_orders.order_id`
 * ou de `idDaVendaBling`, e nunca pode alcançar uma venda registrada à mão.
 */

const UNIQUE_VIOLATION = "23505";

export type LeadDaVenda = SaleLead | null;
export type PedidoParaProjetar = {
  tipo: TipoPedido;
  blingOrderId: number;
  orderId: string | null;
  total: number;
  telefone: string | null;
  saleAt: Date;
  lead: LeadDaVenda;
};

/**
 * O id da venda em `orders`, o mesmo em toda volta: a que morre depois de criar e antes de ligar
 * (`bling_orders.order_id`) não deixa a seguinte criar outra — o insert dá 23505 e vira update.
 * UUID dos 16 primeiros bytes de sha256("bling:<loja>:<pedido>"), versão 8 e variante RFC
 * (RFC 9562, "custom").
 */
export function idDaVendaBling(tenantId: string, blingOrderId: number): string {
  const b = Buffer.from(createHash("sha256").update(`bling:${tenantId}:${blingOrderId}`).digest().subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Devolve o `order_id` atual: o criado, o mantido, ou null quando não é (mais) venda. */
export async function projetarPedido(tenantId: string, p: PedidoParaProjetar): Promise<string | null> {
  const id = idDaVendaBling(tenantId, p.blingOrderId);
  if (p.tipo !== "venda") {
    // Também pelo id determinístico: a volta que criou e morreu antes de ligar deixou a venda sem ligação.
    await apagar(tenantId, p.orderId ? [p.orderId, id] : [id]);
    return null;
  }
  const valor = toCents(p.total);
  // A classificação já manda total ≤ 0 para "ignorado"; o relatório do funil recusa valor ≤ 0.
  if (!(valor > 0)) throw new Error("bling: venda com total <= 0 não entra em orders");
  const telefone = (p.telefone ?? "").replace(/\D/g, "");
  if (p.orderId && (await atualizar(tenantId, p.orderId, valor, telefone))) return p.orderId;
  // Sem pedido, ou o pedido sumiu (apagado à mão no banco): cria de novo.
  return criar(tenantId, id, p, valor, telefone);
}

/**
 * Lead, campanha e marco `first_order` como no "Registrar venda": pelo `recordOrder`. A busca de
 * campanha que falha sobe (a venda criada sem campanha nunca mais ganharia uma: o update não mexe).
 */
async function criar(tenantId: string, id: string, p: PedidoParaProjetar, valor: number, telefone: string): Promise<string> {
  const pedido = await recordOrder(
    tenantId,
    p.lead,
    async (campaignId) => {
      const { error } = await getSupabaseAdmin()
        .from("orders")
        .insert({
          id,
          tenant_id: tenantId,
          phone: telefone,
          lead_id: p.lead?.id ?? null,
          group_name: p.lead?.source_group_name ?? null,
          campaign_id: campaignId ?? null,
          value: valor,
          source: "bling",
          // O funil conta a venda pela data dela, não pela hora da importação.
          created_at: p.saleAt.toISOString(),
        });
      // 23505: uma volta anterior já criou esta venda (e morreu antes de ligar) — é a mesma, só atualiza.
      if (error?.code === UNIQUE_VIOLATION && (await atualizar(tenantId, id, valor, telefone))) return { id };
      if (error) throw new Error(error.message);
      return { id };
    },
    { throwOnCampaignError: true },
  );
  return pedido.id;
}

/** Só valor e telefone mudam: lead e campanha ficam os da criação. false = a linha não existe mais. */
async function atualizar(tenantId: string, orderId: string, valor: number, telefone: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .update({ value: valor, phone: telefone })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .eq("source", "bling")
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function apagar(tenantId: string, ids: string[]): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("orders")
    .delete()
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .eq("source", "bling");
  if (error) throw new Error(error.message);
}
