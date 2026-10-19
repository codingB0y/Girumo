import "server-only";

import { listarCanaisDeVenda } from "./api";
import { ErroBling, type ClienteBling } from "./cliente";
import { agoraMs, comoParada, iso, mensagemDe, rotulo, type Rodada } from "./sincronizar-execucao";
import type { CanalBling } from "./tipos";

/** Como as situações: uma conta muda de canal raramente, e o cartão tem os ids dos pedidos enquanto isso. */
const CANAIS_VALEM_MS = 24 * 3_600_000;

/**
 * Os canais de venda da conta (Yampi, Shopee...), pelo nome, para o cartão. Nunca lidos (hora nula: conexão nova,
 * reconexão) ou com mais de 24 h: relê. Sem o escopo no app do Bling (403) não é erro da loja: grava null com a hora e
 * segue — a reconexão, que pode trazer o escopo, zera a hora. Outro erro do Bling também não conta como falha da loja
 * (o nome do canal não segura venda nenhuma): fica a lista que havia, e a execução seguinte tenta de novo. O prazo da
 * execução, sim, para a rodada.
 */
export async function atualizarCanais(r: Rodada, cliente: ClienteBling): Promise<void> {
  const { salesChannelsAt } = r.conexao;
  const lidosHa = salesChannelsAt ? agoraMs(r.ex) - Date.parse(salesChannelsAt) : Number.POSITIVE_INFINITY;
  if (lidosHa <= CANAIS_VALEM_MS) return;
  let canais: CanalBling[] | null;
  try {
    canais = await canaisDaConta(cliente);
  } catch (e) {
    const parada = comoParada(e);
    if (parada) throw parada;
    console.warn(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: canais de venda: ${mensagemDe(e)}`);
    return;
  }
  const agora = iso(agoraMs(r.ex));
  await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, { sales_channels: canais, sales_channels_at: agora });
  r.conexao = { ...r.conexao, salesChannels: canais, salesChannelsAt: agora };
}

/** null = o app sem o escopo "Canais de venda". */
async function canaisDaConta(cliente: ClienteBling): Promise<CanalBling[] | null> {
  try {
    return await listarCanaisDeVenda(cliente);
  } catch (e) {
    if (e instanceof ErroBling && e.tipo === "escopo") return null;
    throw e;
  }
}
