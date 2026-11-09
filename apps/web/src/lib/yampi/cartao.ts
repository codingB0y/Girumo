import "server-only";

import { abrir, chaveDeIntegracoes } from "@/lib/security/secret-box";
import { lerConexaoYampi } from "@/lib/stores/yampi-conexoes";

import { AVISO_NAO_CRIADO } from "./conectar";
import { NAO_RELIGOU, YAMPI_FORA } from "./conferir";
import { contextoDoSegredo } from "./credenciais";
import { ERRO_DA_CONEXAO } from "./credencial-invalida";
import type { StatusYampi } from "./tipos";

export type CartaoYampi = {
  /** `INTEGRATIONS_ENCRYPTION_KEY` presente. */
  disponivel: boolean;
  conexao: null | {
    status: Exclude<StatusYampi, "desconectada">;
    alias: string;
    token_final: string | null;
    ultimo_aviso_em: string | null;
    ultima_conferencia_em: string | null;
    ultimo_erro: string | null;
  };
};

/** Só as frases que o próprio app escreve em `last_error` chegam à tela. */
const ERROS_DA_TELA = new Set([ERRO_DA_CONEXAO, YAMPI_FORA, NAO_RELIGOU, AVISO_NAO_CRIADO]);

/** O cartão de Configurações › Integrações: nunca token, chave nem segredo do aviso, só os 4 finais do token. */
export async function montarCartaoYampi(tenantId: string): Promise<CartaoYampi> {
  const chave = chaveDeIntegracoes();
  if (!chave) return { disponivel: false, conexao: null };
  const c = await lerConexaoYampi(tenantId);
  if (!c || c.status === "desconectada") return { disponivel: true, conexao: null };

  let tokenFinal: string | null = null;
  try {
    if (c.userTokenSelado) tokenFinal = abrir(c.userTokenSelado, contextoDoSegredo(tenantId, "user_token"), chave).slice(-4);
  } catch {
    // Cifra que não abre: o cartão segue sem o final do token.
  }
  return {
    disponivel: true,
    conexao: {
      status: c.status,
      alias: c.alias,
      token_final: tokenFinal,
      ultimo_aviso_em: c.lastEventAt,
      ultima_conferencia_em: c.lastCheckAt,
      ultimo_erro: c.lastError && ERROS_DA_TELA.has(c.lastError) ? c.lastError : null,
    },
  };
}
