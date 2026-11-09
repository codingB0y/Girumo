import "server-only";

import { tenantGrantsPlan } from "@/lib/billing/entitlements";
import { canaisDoAviso, ehEtapaComAviso, mudancaParaAvisar } from "@/lib/rastreio/avisar";
import { pepperDoRastreio } from "@/lib/rastreio/documento";
import { pedidoDaYampi } from "@/lib/rastreio/pedido-yampi";
import type { Canal, OrigemDoPedido, PedidoGravado, PedidoParaGravar, RastreioConfig } from "@/lib/rastreio/tipos";
import { criarAvisos } from "@/lib/stores/rastreio-avisos";
import { lerConfig } from "@/lib/stores/rastreio-config";
import { gravarPedido } from "@/lib/stores/rastreio-pedidos";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/** Eventos da Yampi que registram pedido (carrinho não). */
export const EVENTOS_DO_RASTREIO = ["order.created", "order.paid", "order.status.updated"] as const;

export type DepsRegistrar = {
  pepper: () => string;
  gravarPedido: (tenantId: string, pedido: PedidoParaGravar, origem: OrigemDoPedido) => Promise<PedidoGravado>;
  lerConfig: (tenantId: string) => Promise<RastreioConfig | null>;
  planoAtivo: (tenantId: string) => Promise<boolean>;
  criarAvisos: typeof criarAvisos;
  avisarLoja: (tenantId: string, pedido: { id: string; numero: string }) => Promise<boolean>;
  agora: () => Date;
};

/** Sininho da loja: uma notificação por pedido com problema, apontando para Entregas. */
export async function avisarLojaDoProblema(tenantId: string, pedido: { id: string; numero: string }): Promise<boolean> {
  const db = getSupabaseAdmin();
  const href = `/painel/vendas/entregas?pedido=${pedido.id}`;
  const achou = await db.from("notifications").select("id").eq("tenant_id", tenantId).eq("type", "rastreio_problema").eq("href", href).limit(1);
  if (achou.error) throw new Error(achou.error.message);
  if ((achou.data ?? []).length > 0) return false;
  const { error } = await db.from("notifications").insert({
    tenant_id: tenantId,
    type: "rastreio_problema",
    title: `Problema na entrega do pedido nº ${pedido.numero}`,
    body: "A transportadora não conseguiu entregar. Fale com a compradora.",
    href,
  });
  if (error) throw new Error(error.message);
  return true;
}

const DEPS: DepsRegistrar = {
  pepper: pepperDoRastreio, gravarPedido, lerConfig, planoAtivo: tenantGrantsPlan, criarAvisos,
  avisarLoja: avisarLojaDoProblema, agora: () => new Date(),
};

/**
 * Grava o pedido da Yampi e cria os avisos da etapa nova. Nenhum dado do pedido entra em erro ou log.
 * // ponytail: falha entre gravar e avisar perde o aviso daquela etapa (a retentativa vê `mudou = false`);
 * a página fica certa. Subir para "avisos criados na RPC" se aparecer na prova.
 */
export async function registrarPedidoDaYampi(
  tenantId: string,
  payload: unknown,
  origem: OrigemDoPedido,
  deps: DepsRegistrar = DEPS,
): Promise<{ gravado: PedidoGravado; avisos: { id: string; canal: Canal }[] } | null> {
  const pedido = pedidoDaYampi(payload, deps.pepper());
  if (!pedido) {
    console.warn(`[rastreio] ${tenantId}: pedido da Yampi fora do formato (${origem})`);
    return null;
  }
  const gravado = await deps.gravarPedido(tenantId, pedido, origem);
  const agora = deps.agora();
  const sem = { gravado, avisos: [] };
  if (!mudancaParaAvisar({ gravado, origem, atualizadoNaYampi: pedido.atualizadoNaYampi, agora })) return sem;

  const [plano, config] = await Promise.all([deps.planoAtivo(tenantId), deps.lerConfig(tenantId)]);
  if (!plano || !config) return sem;

  const canais = canaisDoAviso({
    gravado, origem, atualizadoNaYampi: pedido.atualizadoNaYampi, agora, matriz: config.matrix,
    paradoEm: gravado.paradoEm, temTelefone: gravado.temTelefone, temEmail: gravado.temEmail,
  });
  const avisos = canais.length > 0 && ehEtapaComAviso(gravado.etapa)
    ? await deps.criarAvisos(tenantId, gravado.id, gravado.etapa, canais)
    : [];
  if (gravado.etapa === "problema") await deps.avisarLoja(tenantId, { id: gravado.id, numero: pedido.numero });
  return { gravado, avisos };
}
