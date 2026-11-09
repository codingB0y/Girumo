import "server-only";

import { dayBR } from "@/lib/date-br";
import { pepperDoRastreio } from "@/lib/rastreio/documento";
import { dataDaYampi } from "@/lib/rastreio/pedido-yampi";
import { registrarPedidoDaYampi } from "@/lib/rastreio/registrar";
import type { OrigemDoPedido } from "@/lib/rastreio/tipos";
import { avancarCursor, lerConfig } from "@/lib/stores/rastreio-config";
import { yampiGet } from "@/lib/yampi/api";
import { conexaoYampiAtiva } from "@/lib/yampi/conexao";
import type { ConexaoYampi } from "@/lib/yampi/tipos";

const POR_PAGINA = 100;
const TETO_IMPORTACAO = 20;
const TETO_VARREDURA = 10;
const FOLGA_VARREDURA_MS = 5 * 60_000;

export type DepsImportar = {
  conexao: typeof conexaoYampiAtiva;
  get: typeof yampiGet;
  registrar: typeof registrarPedidoDaYampi;
  lerConfig: typeof lerConfig;
  avancarCursor: typeof avancarCursor;
  pepper: typeof pepperDoRastreio;
  agora: () => Date;
};
const DEPS: DepsImportar = {
  conexao: conexaoYampiAtiva, get: yampiGet, registrar: registrarPedidoDaYampi, lerConfig, avancarCursor,
  pepper: pepperDoRastreio, agora: () => new Date(),
};

/**
 * Lê os pedidos por `updated_at` (a janela da Yampi inclui o dia final e recusa horas) e registra um a um.
 * `YampiErro` sobe: quem chama decide a espera. Log só com tenant, id do pedido e origem.
 */
async function lerPaginas(
  tenantId: string, conexao: ConexaoYampi, de: Date, ate: Date, teto: number, origem: OrigemDoPedido,
  descartaAntesDe: number | null, deps: DepsImportar,
): Promise<number> {
  let registrados = 0;
  for (let page = 1; page <= teto; page++) {
    const { data } = await deps.get<{ data: unknown[] }>(conexao, "/orders", {
      date: `updated_at:${dayBR(de)}|${dayBR(ate)}`, include: "customer,status,statuses", limit: POR_PAGINA, page,
    });
    for (const p of data) {
      const em = dataDaYampi((p as { updated_at?: unknown } | null)?.updated_at);
      if (descartaAntesDe !== null && (em === null || Date.parse(em) < descartaAntesDe)) continue;
      try {
        if (await deps.registrar(tenantId, p, origem)) registrados++;
      } catch (e) {
        console.error(`[rastreio] ${tenantId}: pedido ${String((p as { id?: unknown } | null)?.id)} não gravou (${origem}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (data.length < POR_PAGINA) return registrados;
  }
  console.warn(`[rastreio] ${tenantId}: ${origem} parou no teto de ${teto} páginas`);
  return registrados;
}

export async function importarPedidos(tenantId: string, desde: Date, deps: DepsImportar = DEPS): Promise<number> {
  deps.pepper();
  const conexao = await deps.conexao(tenantId);
  if (!conexao) throw new Error("[rastreio] importação sem conexão ativa com a Yampi");
  return lerPaginas(tenantId, conexao, desde, deps.agora(), TETO_IMPORTACAO, "importacao", null, deps);
}

/** Pega o que mudou desde o cursor (menos 5 min de folga). O cursor só anda depois do laço: erro não o move. */
export async function varrerPedidos(tenantId: string, agora: Date, deps: DepsImportar = DEPS): Promise<number> {
  deps.pepper();
  const [conexao, config] = await Promise.all([deps.conexao(tenantId), deps.lerConfig(tenantId)]);
  if (!conexao || !config) return 0; // o cursor fica: a conexão de volta recupera a janela
  const inicio = Date.parse(config.sweepCursor ?? agora.toISOString()) - FOLGA_VARREDURA_MS;
  const registrados = await lerPaginas(tenantId, conexao, new Date(inicio), agora, TETO_VARREDURA, "varredura", inicio, deps);
  await deps.avancarCursor(tenantId, agora.toISOString());
  return registrados;
}
