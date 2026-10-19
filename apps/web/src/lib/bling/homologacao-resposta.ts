import type { RelatorioHomologacao } from "./homologacao";
import type { Resultado } from "./sincronizar";

/** O que a rota do admin responde para o teste da homologação (`POST /api/admin/bling/homologacao`). */
export type RespostaDaHomologacao = { status: number; corpo: { relatorio: RelatorioHomologacao } | { error: string } };

const MOTIVO: Partial<Record<NonNullable<Resultado["parou"]>, string>> = {
  reconectar: "a loja precisa reconectar o Bling",
  inativa: "a conexão da loja não está ativa",
  chave: "os tokens da loja não abrem com a chave de agora",
  indisponivel: "a integração está sem as variáveis do Bling",
  limite_token: "a renovação do acesso está barrada agora",
};

/** Rodou = 200 com o relatório (o ok/erro do teste vai nele). Sem a trava = 409; parou antes = 422 com o motivo. */
export function respostaDaHomologacao(r: Resultado): RespostaDaHomologacao {
  if (r.homologacao) return { status: 200, corpo: { relatorio: r.homologacao } };
  if (!r.trava && !r.parou) {
    return { status: 409, corpo: { error: "A loja está sincronizando agora (ou pausada por erros seguidos do Bling). Tente de novo em alguns segundos." } };
  }
  const motivo = (r.parou && MOTIVO[r.parou]) ?? `parou: ${r.parou ?? "sem motivo"}`;
  return { status: 422, corpo: { error: `O teste não rodou: ${motivo}.` } };
}
