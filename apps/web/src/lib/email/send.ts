import "server-only";
import { getResend, FROM_EMAIL } from "./client";

type SendOptions = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Envia email transacional via Resend.
 * Non-blocking: loga erros mas não joga exception.
 */
export async function sendEmail({ to, subject, html }: SendOptions): Promise<boolean> {
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[email] Failed to send to ${to}:`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[email] Exception sending to ${to}:`, err);
    return false;
  }
}
