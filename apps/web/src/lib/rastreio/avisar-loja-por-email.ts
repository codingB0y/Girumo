import "server-only";

import { donosDaLoja, type Dono } from "@/lib/bling/avisar-reconectar";
import { sendEmail } from "@/lib/email/send";
import { rastreioProblemaEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/environment";
import { lerConfig } from "@/lib/stores/rastreio-config";

/**
 * E-mail aos donos quando um pedido vira `problema`. Sai junto com o sininho (uma vez por pedido) e só
 * com "me avisar por e-mail quando houver problema" ligado; o sininho sai sempre. Sem retentativa de
 * propósito: o sininho já avisou e a falha fica em public.logs. Sem `idempotencyKey`: seria por pedido,
 * e cada dono recebe um conteúdo (o Resend responderia 409). Nunca lança; o log não leva endereço.
 */

export type DepsDoAlertaDaLoja = {
  donos: typeof donosDaLoja;
  enviar: typeof sendEmail;
  appUrl: () => string;
  config: typeof lerConfig;
};

const ROTULO = "[rastreio/alerta-da-loja]";

function depsReais(): DepsDoAlertaDaLoja {
  return { donos: donosDaLoja, enviar: sendEmail, appUrl: getAppUrl, config: lerConfig };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function emailDoProblemaParaLoja(
  tenantId: string,
  pedido: { id: string; numero: string },
  deps: DepsDoAlertaDaLoja = depsReais(),
): Promise<void> {
  let donos: Dono[];
  let href: string;
  try {
    const config = await deps.config(tenantId);
    if (!config?.notifyStoreOnProblem) return;
    donos = await deps.donos(tenantId);
    href = `${deps.appUrl()}/painel/vendas/entregas?pedido=${encodeURIComponent(pedido.id)}`;
  } catch (e) {
    console.error(`${ROTULO} loja ${tenantId}: ${mensagem(e)}`);
    return;
  }
  // Um dono que falha não segura os outros.
  for (const dono of donos) {
    const { subject, html } = rastreioProblemaEmail(dono.nome, href, pedido.numero);
    try {
      const saiu = await deps.enviar({ to: dono.email, subject, html, tenantId, kind: "rastreio_problema" });
      if (!saiu) console.warn(`${ROTULO} loja ${tenantId}: um e-mail não saiu (o motivo está em public.logs)`);
    } catch (e) {
      console.warn(`${ROTULO} loja ${tenantId}: um e-mail não saiu: ${mensagem(e)}`);
    }
  }
}
