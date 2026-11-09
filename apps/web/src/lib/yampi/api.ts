import "server-only";

import { chaveDeIntegracoes } from "@/lib/security/secret-box";

import { criarClienteYampi, YampiErro, type ClienteYampi, type Query } from "./cliente";
import { marcarCredencialInvalida } from "./credencial-invalida";
import { abrirCredenciais } from "./credenciais";
import type { ConexaoYampi } from "./tipos";

export { YampiErro } from "./cliente";

/**
 * A API da Yampi para os módulos (contrato do índice). Conexão já inválida ou desconectada lança `YampiErro(401)`
 * sem chamar a Yampi nem o banco; um 401 de verdade marca a conexão `credencial_invalida` (com o sino) e relança.
 */
async function comCliente<T>(conexao: ConexaoYampi, fn: (c: ClienteYampi) => Promise<T>): Promise<T> {
  if (conexao.status === "credencial_invalida" || conexao.status === "desconectada") {
    throw new YampiErro(401, "Yampi: conexão sem credencial válida");
  }
  const chave = chaveDeIntegracoes();
  if (!chave) throw new Error("Yampi indisponível: INTEGRATIONS_ENCRYPTION_KEY ausente");
  const { token, secretKey } = abrirCredenciais(conexao, chave);
  try {
    return await fn(criarClienteYampi({ alias: conexao.alias, token, secretKey }));
  } catch (e) {
    if (e instanceof YampiErro && e.status === 401) await marcarCredencialInvalida(conexao.tenantId, conexao.userTokenSelado);
    throw e;
  }
}

export function yampiGet<T>(conexao: ConexaoYampi, caminho: string, query?: Query): Promise<T> {
  return comCliente(conexao, (c) => c.get<T>(caminho, query));
}

export function yampiPost<T>(conexao: ConexaoYampi, caminho: string, corpo: unknown): Promise<T> {
  return comCliente(conexao, (c) => c.post<T>(caminho, corpo));
}

export function yampiApagar(conexao: ConexaoYampi, caminho: string): Promise<void> {
  return comCliente(conexao, (c) => c.apagar(caminho));
}
