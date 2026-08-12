import "server-only";
import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");

  resendClient = new Resend(apiKey);
  return resendClient;
}

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Girumo <noreply@girumo.com.br>";
