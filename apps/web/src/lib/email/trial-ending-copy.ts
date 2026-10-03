import { formatarPreco } from "../billing/plan-display";
import { diaMesBR } from "../date-br";

/**
 * O texto do e-mail "seu teste grátis termina em 3 dias", puro para ser testado
 * (mesmo padrão de invite-copy e broadcast-failed-copy). O HTML fica em templates.ts.
 *
 * Não menciona reembolso de propósito: desde 03/10/2026 ele vive só nos Termos.
 * O que o e-mail PRECISA ter é valor, data e como cancelar antes — é o aviso que
 * as bandeiras exigem para teste com cartão.
 */
export type TrialEndingCopyInput = {
  planName: string;
  amountCents: number;
  /** Fim do teste = data da 1ª cobrança (ISO). */
  chargeAt: string;
  cardLast4: string | null;
};

export type TrialEndingCopy = {
  subject: string;
  titulo: string;
  cobranca: string;
  botao: string;
  /** Último dia para cancelar sem cobrança: a véspera da cobrança. */
  cancelarAte: string;
};

const DIA_MS = 86_400_000;

export function trialEndingCopy(i: TrialEndingCopyInput): TrialEndingCopy {
  const data = diaMesBR(i.chargeAt) ?? "";
  const vespera = diaMesBR(new Date(Date.parse(i.chargeAt) - DIA_MS).toISOString()) ?? "";
  const cartao = i.cardLast4 ? `no cartão final ${i.cardLast4}` : "no cartão cadastrado";

  return {
    subject: "Seu teste grátis termina em 3 dias",
    titulo: `Seu teste do ${i.planName} termina em ${data}`,
    cobranca: `Nesse dia cobramos ${formatarPreco(i.amountCents)} ${cartao} e a assinatura continua sozinha, sem você precisar fazer nada.`,
    botao: `Continuar no ${i.planName}`,
    cancelarAte: vespera,
  };
}
