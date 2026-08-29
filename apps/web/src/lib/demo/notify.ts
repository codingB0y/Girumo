import "server-only";
import { getResend, FROM_EMAIL } from "@/lib/email/client";
import { stepAt } from "./script";

/**
 * Avisa o time de vendas que alguém pediu demonstração.
 *
 * NÃO usa `sendEmail` de propósito: aquele helper grava o resultado em
 * `public.logs`, cuja coluna `tenant_id` é NOT NULL — e quem preenche este
 * formulário é pré-tenant. Emprestar o tenant de outra pessoa só para satisfazer
 * a constraint seria mentira no log de entrega.
 *
 * O registro do envio mora em `demo_requests.notified_at`.
 *
 * Best-effort: devolve `false` em vez de lançar. Quando isto roda, a linha já
 * está no banco — derrubar a resposta por causa do aviso seria perder o lead
 * duas vezes.
 */
export async function notifyDemoRequest(input: {
  name: string;
  phone: string;
  stepReached: number | null;
  /** false quando o insert falhou e o e-mail é a única cópia que restou. */
  persisted: boolean;
}): Promise<boolean> {
  const to = process.env.SALES_NOTIFICATION_EMAIL;
  if (!to) {
    console.error("[demo] SALES_NOTIFICATION_EMAIL ausente — aviso de venda não enviado.");
    return false;
  }

  const step = input.stepReached === null ? "não informado" : stepAt(input.stepReached).title;
  const alerta = input.persisted
    ? ""
    : "<p><strong>Atenção: esta solicitação NÃO foi gravada no banco.</strong> " +
      "Este e-mail é a única cópia — responda agora.</p>";

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Demonstração pedida: ${input.name}`,
      html:
        `${alerta}` +
        `<p><strong>${input.name}</strong> pediu uma demonstração.</p>` +
        `<p>WhatsApp: <a href="https://wa.me/55${input.phone}">${input.phone}</a></p>` +
        `<p>Parou em: ${step}</p>`,
    });
    if (error) {
      console.error("[demo] Resend recusou o aviso de venda:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[demo] Falha ao enviar aviso de venda:", err);
    return false;
  }
}
