import "server-only";

import { listarCanaisDeVenda } from "./api";
import { ErroBling, type ClienteBling } from "./cliente";
import { agoraMs, iso, mensagemDe, MINIMO_PARA_UMA_LINHA_MS, ParadaDaRodada, resto, rotulo, type Rodada } from "./sincronizar-execucao";
import type { CanalBling } from "./tipos";

/** Como as situações: uma conta muda de canal raramente, e o cartão tem os ids dos pedidos enquanto isso. */
const CANAIS_VALEM_MS = 24 * 3_600_000;
/** Falhou: tenta de novo depois disto (a hora gravada fica para trás o bastante para vencer nesse tempo). */
const RECUO_MS = 3_600_000;
/** O teto da leitura, com as novas tentativas do cliente: o nome do canal não pode comer o tempo da fila. */
const PRAZO_DOS_CANAIS_MS = 8_000;

/**
 * Os canais de venda da conta (Yampi, Shopee...), pelo nome, para o cartão. Nunca lidos (hora nula: conexão nova,
 * reconexão) ou com mais de 24 h: relê, antes da fila — a Yampi tem de aparecer logo depois de conectar, para sair do
 * Meta antes do primeiro pedido dela. O nome do canal não segura venda nenhuma, então nada aqui para a loja:
 * - sem o escopo no app do Bling (403): grava null com a hora; a reconexão, que pode trazer o escopo, zera a hora;
 * - outro erro, ou o prazo próprio (8 s) acabou: fica a lista que havia e tenta de novo em 1 h;
 * - sem tempo para isso e uma linha da fila: fica para a próxima execução;
 * - a gravação falhou: só o log (a próxima execução relê).
 * Só a parada da rodada (a loja que pediu reconexão no meio) sobe.
 */
export async function atualizarCanais(r: Rodada, cliente: ClienteBling): Promise<void> {
  const { salesChannelsAt } = r.conexao;
  const lidosHa = salesChannelsAt ? agoraMs(r.ex) - Date.parse(salesChannelsAt) : Number.POSITIVE_INFINITY;
  if (lidosHa <= CANAIS_VALEM_MS || resto(r.ex) < PRAZO_DOS_CANAIS_MS + MINIMO_PARA_UMA_LINHA_MS) return;
  const agora = agoraMs(r.ex);
  try {
    const canais = await canaisDaConta(cliente, agora + PRAZO_DOS_CANAIS_MS);
    await gravar(r, { sales_channels: canais, sales_channels_at: iso(agora) });
  } catch (e) {
    if (e instanceof ParadaDaRodada) throw e;
    console.warn(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: canais de venda: ${mensagemDe(e)}`);
    await gravar(r, { sales_channels_at: iso(agora - CANAIS_VALEM_MS + RECUO_MS) });
  }
}

/** null = o app sem o escopo "Canais de venda". */
async function canaisDaConta(cliente: ClienteBling, prazo: number): Promise<CanalBling[] | null> {
  try {
    return await listarCanaisDeVenda(cliente, prazo);
  } catch (e) {
    if (e instanceof ErroBling && e.tipo === "escopo") return null;
    throw e;
  }
}

type Gravacao = { sales_channels?: CanalBling[] | null; sales_channels_at: string };

async function gravar(r: Rodada, campos: Gravacao): Promise<void> {
  try {
    await r.ex.deps.conexoes.atualizarConexao(r.ex.tenantId, campos);
  } catch (e) {
    console.warn(`[bling/sincronizar] ${rotulo(r.ex.tenantId)}: canais de venda: gravar falhou: ${mensagemDe(e)}`);
  }
}
