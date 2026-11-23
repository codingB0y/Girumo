import "server-only";

import { donosDaLoja, type Dono } from "@/lib/bling/avisar-reconectar";
import { sendEmail } from "@/lib/email/send";
import { rastreioProblemaEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/environment";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { lerConfig } from "@/lib/stores/rastreio-config";

/**
 * E-mail aos donos quando um pedido vira `problema`. Sai junto com o sininho (uma vez por pedido) e só
 * com o "me avisar quando um pedido tiver problema" ligado; o sininho sai sempre. Sem retentativa de
 * propósito: o sininho já avisou e a falha fica em public.logs. Sem `idempotencyKey`: seria por pedido,
 * e cada dono recebe um conteúdo (o Resend responderia 409). Nunca lança; o log não leva endereço.
 */

export type DepsDoAlertaDaLoja = {
  donos: typeof donosDaLoja;
  enviar: typeof sendEmail;
  appUrl: () => string;
  config: typeof lerConfig;
  /** true = a loja passou do teto de alertas por hora. */
  estourou: (tenantId: string) => Promise<boolean>;
  prazoMs: number;
};

const ROTULO = "[rastreio/alerta-da-loja]";
/** Uma devolução em massa não vira 300 e-mails por dono: passou disso, fica só o sininho. */
const TETO_POR_HORA = 10;
const HORA_MS = 60 * 60 * 1000;
/**
 * O registrar espera este envio antes de criar o aviso da compradora; o SDK do Resend não tem timeout.
 * Passado o prazo, segue sem esperar (o envio em andamento não é cancelado).
 */
const PRAZO_MS = 10_000;

function depsReais(): DepsDoAlertaDaLoja {
  return {
    donos: donosDaLoja,
    enviar: sendEmail,
    appUrl: getAppUrl,
    config: lerConfig,
    estourou: (tenantId) => checkRateLimit(`rastreio:alerta-problema:${tenantId}`, TETO_POR_HORA, HORA_MS),
    prazoMs: PRAZO_MS,
  };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function enviarAosDonos(tenantId: string, pedido: { id: string; numero: string }, deps: DepsDoAlertaDaLoja): Promise<void> {
  let donos: Dono[];
  let href: string;
  try {
    const config = await deps.config(tenantId);
    if (!config?.notifyStoreOnProblem) return;
    if (await deps.estourou(tenantId)) {
      console.warn(`${ROTULO} loja ${tenantId}: passou de ${TETO_POR_HORA} alertas na hora; fica só o sininho`);
      return;
    }
    donos = await deps.donos(tenantId);
    href = `${deps.appUrl()}/painel/vendas/entregas?pedido=${encodeURIComponent(pedido.id)}`;
  } catch (e) {
    console.error(`${ROTULO} loja ${tenantId}: ${mensagem(e)}`);
    return;
  }
  // Um dono que falha não segura os outros.
  for (const dono of donos) {
    try {
      const { subject, html } = rastreioProblemaEmail(dono.nome, href, pedido.numero);
      const saiu = await deps.enviar({ to: dono.email, subject, html, tenantId, kind: "rastreio_problema" });
      if (!saiu) console.warn(`${ROTULO} loja ${tenantId}: um e-mail não saiu (o motivo está em public.logs)`);
    } catch (e) {
      console.warn(`${ROTULO} loja ${tenantId}: um e-mail não saiu: ${mensagem(e)}`);
    }
  }
}

export async function emailDoProblemaParaLoja(
  tenantId: string,
  pedido: { id: string; numero: string },
  deps: DepsDoAlertaDaLoja = depsReais(),
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<"prazo">((fim) => {
    timer = setTimeout(() => fim("prazo"), deps.prazoMs);
  });
  try {
    const envio = enviarAosDonos(tenantId, pedido, deps).catch((e: unknown) => {
      console.error(`${ROTULO} loja ${tenantId}: ${mensagem(e)}`);
    });
    if ((await Promise.race([envio, prazo])) === "prazo") {
      console.warn(`${ROTULO} loja ${tenantId}: o envio passou de ${deps.prazoMs} ms; segue sem esperar`);
    }
  } finally {
    clearTimeout(timer);
  }
}
