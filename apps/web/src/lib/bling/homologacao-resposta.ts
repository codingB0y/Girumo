import { z } from "zod";

import { horaBR } from "@/lib/date-br";
import type { ConexaoBling } from "@/lib/stores/bling-conexoes";

import type { RelatorioHomologacao } from "./homologacao";
import type { Resultado } from "./sincronizar";

/**
 * A rota do admin do teste da homologação (`POST /api/admin/bling/homologacao`), fora do arquivo de rota para ser
 * testada: só super-admin, só do próprio site, e a resposta que diz por que o teste não rodou. O teste invalida o
 * acesso da loja escolhida no meio (o motor renova), então cada execução deixa uma linha de auditoria no log.
 */

export type DepsDoAdmin = {
  admin: () => Promise<{ authUserId: string } | null>;
  disponivel: () => boolean;
  sincronizar: (tenantId: string) => Promise<Resultado>;
  lerConexao: (tenantId: string) => Promise<ConexaoBling | null>;
  agora: () => Date;
  log: (linha: string) => void;
};

export type RespostaDoAdmin = { status: number; corpo: { relatorio: RelatorioHomologacao } | { error: string } };

const corpoSchema = z.strictObject({ tenantId: z.uuid() });

const MOTIVO: Partial<Record<NonNullable<Resultado["parou"]>, string>> = {
  reconectar: "a loja precisa reconectar o Bling",
  inativa: "a conexão da loja não está ativa",
  chave: "os tokens da loja não abrem com a chave de agora",
  indisponivel: "a integração está sem as variáveis do Bling",
  limite_token: "a renovação do acesso está barrada agora",
};

const erro = (status: number, mensagem: string): RespostaDoAdmin => ({ status, corpo: { error: mensagem } });

export async function homologarPeloAdmin(req: Request, d: DepsDoAdmin): Promise<RespostaDoAdmin> {
  const admin = await d.admin();
  if (!admin) return erro(401, "Não autorizado.");
  // Cookie de sessão + POST: o navegador marca de onde veio; de outro site, não roda. Sem o cabeçalho, passa.
  const site = req.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return erro(403, "Pedido de fora da Girumo.");
  if (!d.disponivel()) return erro(503, "Integração com o Bling indisponível.");
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return erro(400, "JSON inválido.");
  }
  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) return erro(400, "Escolha a loja.");
  const { tenantId } = lido.data;
  const r = await d.sincronizar(tenantId);
  if (r.homologacao) {
    const h = r.homologacao;
    d.log(`[bling/homologacao] admin ${admin.authUserId} loja ${tenantId}: ${h.ok ? "ok" : "falhou"} em ${h.totalMs} ms, renovou ${h.passos.some((p) => p.renovou)}`);
    return { status: 200, corpo: { relatorio: h } };
  }
  if (!r.trava && !r.parou) return semTrava(d, tenantId);
  const motivo = (r.parou && MOTIVO[r.parou]) ?? `parou: ${r.parou ?? "sem motivo"}`;
  return erro(422, `O teste não rodou: ${motivo}.`);
}

/** O `bling_claim` recusa loja sem conexão ativa, pausada ou com a trava de outra execução: diz qual. */
async function semTrava(d: DepsDoAdmin, tenantId: string): Promise<RespostaDoAdmin> {
  const c = await d.lerConexao(tenantId);
  if (!c || c.status === "desconectada") return erro(404, "Esta loja não tem o Bling conectado.");
  if (c.status === "reconectar") return erro(422, "O teste não rodou: a loja precisa reconectar o Bling.");
  const pausa = c.pausedUntil ? Date.parse(c.pausedUntil) : Number.NaN;
  if (pausa > d.agora().getTime()) {
    return erro(409, `A loja está pausada por erros seguidos do Bling até ${horaBR(c.pausedUntil)}.`);
  }
  return erro(409, "A loja está sincronizando agora. Tente de novo em 1 minuto.");
}
