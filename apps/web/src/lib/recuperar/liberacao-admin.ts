export type AcaoDeLiberacao = "ligar" | "desligar";

export type DecisaoDeLiberacao = { ok: true } | { ok: false; status: 400 | 409; error: string };

/**
 * Liberar/desligar o Recuperar à mão (loja piloto, sem Stripe). Pura, para rodar sob
 * `tsx --test`; a rota só traz os fatos (corpo e Stripe) e devolve o `status` daqui.
 *
 * Ligar exige o aviso de privacidade confirmado: sem ele não há registro de que o
 * lojista foi avisado. Desligar com assinatura viva no Stripe é recusado porque o
 * próximo evento do Stripe liga de novo e a cobrança segue.
 */
export function decidirLiberacao(p: {
  acao: AcaoDeLiberacao;
  avisoConfirmado: boolean;
  assinaturaNoStripe: boolean;
}): DecisaoDeLiberacao {
  if (p.acao === "ligar" && !p.avisoConfirmado) {
    return { ok: false, status: 400, error: "Confirme que o lojista foi avisado do texto de privacidade." };
  }
  if (p.acao === "desligar" && p.assinaturaNoStripe) {
    return {
      ok: false,
      status: 409,
      error:
        "Esta loja tem assinatura do Recuperar viva no Stripe. Desligar aqui não para a cobrança e o próximo evento do Stripe liga de novo: cancele a assinatura no Dashboard do Stripe.",
    };
  }
  return { ok: true };
}
