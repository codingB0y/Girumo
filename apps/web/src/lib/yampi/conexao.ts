import "server-only";

import { lerConexaoYampi } from "@/lib/stores/yampi-conexoes";

import type { ConexaoYampi } from "./tipos";

/**
 * A conexão que os módulos usam: `ativa` ou `aviso_desativado` (a credencial vale; só o aviso caiu, e a varredura
 * dos módulos cobre). Inválida, desconectada ou ausente → null.
 */
export async function conexaoYampiAtiva(tenantId: string): Promise<ConexaoYampi | null> {
  const conexao = await lerConexaoYampi(tenantId);
  return conexao && (conexao.status === "ativa" || conexao.status === "aviso_desativado") ? conexao : null;
}
