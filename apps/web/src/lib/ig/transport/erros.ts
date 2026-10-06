import type { ZernioError } from "./types";

/** Código gravado em `ig_runs.error_code` → frase da aba Atendimentos. Sem dado pessoal. */
const POR_CODIGO: Record<string, string> = {
  window_expired: "A janela de envio fechou antes de mandar.",
  platform_api_error: "O Instagram recusou o envio.",
  rate_limited: "Limite de envios por hora. Tenta de novo sozinho.",
  payment_required: "A Zernio pede cartão cadastrado pra enviar.",
  network_error: "A Zernio não respondeu a tempo.",
  no_conversation: "Precisa que a pessoa responda antes do próximo direct.",
  unsupported_node: "Este bloco só roda na próxima fase.",
  cycle: "O fluxo deu voltas demais e parou.",
  account_inactive: "A conta do Instagram não está conectada.",
};

export function traduzErro(code: string | null): string {
  if (!code) return "";
  return POR_CODIGO[code] ?? `A Zernio recusou (código ${code}).`;
}

/** Para as rotas do painel (conectar, desconectar, retomar). Nunca repete `details` nem `message` da Zernio. */
export function mensagemParaLojista(e: ZernioError): string {
  if (e.status === 402 || e.code === "payment_required" || e.code === "platform_account_limit") return "A Zernio pede cartão cadastrado antes de conectar mais contas. Fale com a Girumo.";
  if (e.status === 429) return "Limite de chamadas na Zernio. Espere um minuto e tente de novo.";
  if (e.status === 0) return "A Zernio não respondeu. Tente de novo.";
  if (e.status >= 500) return "A Zernio está fora do ar. Tente de novo em alguns minutos.";
  return `A Zernio recusou (código ${e.code}).`;
}
