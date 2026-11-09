import "server-only";

import { importarPedidos, varrerPedidos } from "@/lib/rastreio/importar";
import { avancarCursor, garantirConfig, lerConfig, lojasComRastreio, marcarImportado } from "@/lib/stores/rastreio-config";
import { purgarVencidos } from "@/lib/stores/rastreio-pedidos";
import { YampiErro } from "@/lib/yampi/cliente";
import { conexaoYampiAtiva } from "@/lib/yampi/conexao";

const DIAS_DA_IMPORTACAO = 30;
const DIA_EM_MS = 24 * 60 * 60 * 1000;

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
};

const DEPS: DepsCron = {
  lojas: lojasComRastreio, lerConfig, garantirConfig, conexao: conexaoYampiAtiva, importar: importarPedidos,
  avancarCursor, marcarImportado, varrer: varrerPedidos, purgar: purgarVencidos,
};

const MOTIVO_DA_YAMPI: Record<number, string> = {
  401: "a Yampi recusou a credencial (401)",
  429: "a Yampi limitou as chamadas (429)",
  0: "a Yampi não respondeu",
};

/** Liga a loja nova (config + 30 dias de importação). `true` = já importada, pode varrer. */
async function ligarLoja(tenantId: string, agora: Date, deps: DepsCron): Promise<boolean> {
  const config = (await deps.lerConfig(tenantId)) ?? (await deps.garantirConfig(tenantId));
  if (config.importedAt) return true;
  if (!(await deps.conexao(tenantId))) return false;
  await deps.importar(tenantId, new Date(agora.getTime() - DIAS_DA_IMPORTACAO * DIA_EM_MS));
  await deps.avancarCursor(tenantId, agora.toISOString());
  await deps.marcarImportado(tenantId, agora);
  return true;
}

export async function rodarCronRastreio(
  agora: Date,
  deps: DepsCron = DEPS,
): Promise<{ lojas: number; falhas: number; purgados: number | null }> {
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
  // ponytail: sem orçamento de tempo por loja (molde app/api/cron/bling/executar.ts); acrescentar quando lojas × páginas encostarem nos 300 s.
  const lojas = await deps.lojas(); // lista fora = execução inteira falha (a rota responde 500)
  for (const tenantId of lojas) {
    const importada = await passo("ligar", tenantId, () => ligarLoja(tenantId, agora, deps));
    if (importada) await passo("varrer", tenantId, () => deps.varrer(tenantId, agora));
    // PRs 4 e 5: passos de e-mail e WhatsApp aqui, fora do `if`: aviso criado pelo webhook sai mesmo com a API da loja fora.
  }
  const purgados = agora.getUTCHours() === 6 && agora.getUTCMinutes() < 5 ? await passo("purgar", "global", deps.purgar) : null;
  return { lojas: lojas.length, falhas, purgados };
}
