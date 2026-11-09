import "server-only";

import { importarPedidos, varrerPedidos } from "@/lib/rastreio/importar";
import type { RastreioConfig } from "@/lib/rastreio/tipos";
import { avancarCursor, garantirConfig, lerConfig, lojasComRastreio, marcarImportado } from "@/lib/stores/rastreio-config";
import { purgarVencidos } from "@/lib/stores/rastreio-pedidos";
import { YampiErro } from "@/lib/yampi/cliente";
import { conexaoYampiAtiva } from "@/lib/yampi/conexao";

const DIAS_DA_IMPORTACAO = 30;
const DIA_EM_MS = 24 * 60 * 60 * 1000;
/** 60 s abaixo do `maxDuration` (300 s) da rota: a loja em andamento termina e a rota ainda responde. */
const ORCAMENTO_DA_EXECUCAO_MS = 240_000;

export type DepsCron = {
  lojas: typeof lojasComRastreio;
  lerConfig: typeof lerConfig;
  garantirConfig: typeof garantirConfig;
  conexao: typeof conexaoYampiAtiva;
  importar: typeof importarPedidos;
  avancarCursor: typeof avancarCursor;
  marcarImportado: typeof marcarImportado;
  varrer: typeof varrerPedidos;
  purgar: typeof purgarVencidos;
  relogio: () => number;
};

const DEPS: DepsCron = {
  lojas: lojasComRastreio, lerConfig, garantirConfig, conexao: conexaoYampiAtiva, importar: importarPedidos,
  avancarCursor, marcarImportado, varrer: varrerPedidos, purgar: purgarVencidos, relogio: Date.now,
};

const MOTIVO_DA_YAMPI: Record<number, string> = {
  401: "a Yampi recusou a credencial (401)",
  429: "a Yampi limitou as chamadas (429)",
  0: "a Yampi não respondeu",
};

/** Liga a loja nova (config + 30 dias de importação). A varredura dela fica para a rodada seguinte. */
async function ligarLoja(tenantId: string, lida: RastreioConfig | null, agora: Date, deps: DepsCron): Promise<void> {
  if (!lida) await deps.garantirConfig(tenantId);
  if (!(await deps.conexao(tenantId))) return;
  await deps.importar(tenantId, new Date(agora.getTime() - DIAS_DA_IMPORTACAO * DIA_EM_MS));
  await deps.avancarCursor(tenantId, agora.toISOString());
  await deps.marcarImportado(tenantId, agora);
}

/**
 * Purge primeiro; depois varre as lojas já importadas e só então importa as novas — uma importação grande
 * não deixa as outras lojas sem varredura. Passado o orçamento, nenhuma loja começa: fica para daqui a 5 min.
 */
export async function rodarCronRastreio(
  agora: Date,
  deps: DepsCron = DEPS,
): Promise<{ lojas: number; falhas: number; purgados: number | null }> {
  const inicio = deps.relogio();
  const esgotado = () => deps.relogio() - inicio >= ORCAMENTO_DA_EXECUCAO_MS;
  let falhas = 0;
  async function passo<T>(nome: string, alvo: string, f: () => Promise<T>): Promise<T | null> {
    try {
      return await f();
    } catch (e) {
      falhas++;
      // YampiErro: a loja para nesta rodada (o cursor só anda depois do laço) e a seguinte, 5 min depois, tenta de novo; o cron não espera o retryAfterMs.
      // 401 = token trocado: o yampiGet (B·6b) já marcou a conexão credencial_invalida e avisou no sino, então aqui é só o log. A mensagem do erro fica fora do log.
      const motivo = e instanceof YampiErro ? (MOTIVO_DA_YAMPI[e.status] ?? `a Yampi respondeu ${e.status}`) : e instanceof Error ? e.message : String(e);
      console.error(`[rastreio/cron] ${nome} ${alvo}: ${motivo}`);
      return null;
    }
  }
  const purgados = agora.getUTCHours() === 6 && agora.getUTCMinutes() < 5 ? await passo("purgar", "global", deps.purgar) : null;
  // ponytail: o orçamento é por execução, não por loja; uma importação maior que ele ainda estoura os 300 s — fatiar a importação por página se aparecer.
  const lojas = await deps.lojas(); // lista fora = execução inteira falha (a rota responde 500)
  let adiadas = 0;
  const novas: Array<[string, RastreioConfig | null]> = [];
  for (const [i, tenantId] of lojas.entries()) {
    if (esgotado()) { adiadas += lojas.length - i; break; }
    const lida = await passo("ler", tenantId, async () => ({ config: await deps.lerConfig(tenantId) }));
    if (!lida) continue;
    if (lida.config?.importedAt) await passo("varrer", tenantId, () => deps.varrer(tenantId, agora));
    else novas.push([tenantId, lida.config]);
  }
  for (const [i, [tenantId, config]] of novas.entries()) {
    if (esgotado()) { adiadas += novas.length - i; break; }
    await passo("ligar", tenantId, () => ligarLoja(tenantId, config, agora, deps));
  }
  // PRs 4 e 5: passos de e-mail e WhatsApp por loja, independentes da varredura: aviso criado pelo webhook sai mesmo com a API da loja fora.
  if (adiadas > 0) console.warn(`[rastreio/cron] orçamento de tempo esgotado: ${adiadas} lojas ficam para a próxima rodada`);
  return { lojas: lojas.length, falhas, purgados };
}
