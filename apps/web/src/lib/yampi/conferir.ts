import "server-only";

import { atualizarMesmaConexaoYampi, lerConexaoYampi, type PatchConexaoYampi } from "@/lib/stores/yampi-conexoes";

import { YampiErro } from "./api";
import { estadoDoAviso, listarAvisosDaYampi, recriarAviso, type AvisoNaYampi } from "./webhooks";

export type ResultadoDaConferencia = {
  credenciais: "ok" | "invalida" | "erro";
  aviso: "ativo" | "recriado" | "falhou" | "desconhecido";
};

const YAMPI_FORA = "A Yampi não respondeu na última conferência.";
const NAO_RELIGOU = "Não foi possível religar o aviso na Yampi.";

const recusou = (e: unknown) => e instanceof YampiErro && e.status === 401;

/**
 * Confere a credencial e o aviso de uma loja (cron e Testar). O aviso que a Yampi desligou (30 falhas) ou que sumiu
 * é recriado. Um 401 já marcou a conexão e o sino dentro de `yampiGet`. null = sem conexão ou desconectada.
 * Toda escrita é da mesma conexão (token selado e status vivo): uma desconexão ou um 401 no meio não são desfeitos.
 * ponytail: sem trava entre o cron e o Testar; uma corrida deixa o segredo errado até a próxima conferência (≤ 1 h)
 */
export async function conferirConexao(tenantId: string): Promise<ResultadoDaConferencia | null> {
  const conexao = await lerConexaoYampi(tenantId);
  if (!conexao || conexao.status === "desconectada") return null;
  if (conexao.status === "credencial_invalida") return { credenciais: "invalida", aviso: "desconhecido" };
  const agora = () => new Date().toISOString();
  const gravar = (patch: PatchConexaoYampi) => atualizarMesmaConexaoYampi(tenantId, conexao.userTokenSelado, patch);

  let lista: AvisoNaYampi[];
  try {
    lista = await listarAvisosDaYampi(conexao);
  } catch (e) {
    if (recusou(e)) return { credenciais: "invalida", aviso: "desconhecido" };
    await gravar({ last_check_at: agora(), last_error: YAMPI_FORA });
    return { credenciais: "erro", aviso: "desconhecido" };
  }

  if (estadoDoAviso(lista, conexao) === "ativo") {
    await gravar({ status: "ativa", last_check_at: agora(), last_error: null });
    return { credenciais: "ok", aviso: "ativo" };
  }
  try {
    await recriarAviso(conexao);
    return { credenciais: "ok", aviso: "recriado" };
  } catch (e) {
    if (recusou(e)) return { credenciais: "invalida", aviso: "desconhecido" };
    await gravar({ status: "aviso_desativado", last_check_at: agora(), last_error: NAO_RELIGOU });
    return { credenciais: "ok", aviso: "falhou" };
  }
}
