/**
 * Formatação de telefone para exibição no painel.
 *
 * A engine devolve o número no formato do WhatsApp (só dígitos, com DDI),
 * ex.: `5511987654321`. A UI mostra `+55 11 98765-4321`.
 */

/** `5511987654321` → `+55 11 98765-4321`. Números fora do padrão BR saem só com `+`. */
export function formatPhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // BR celular: 55 + DDD (2) + 9 dígitos
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  // BR fixo: 55 + DDD (2) + 8 dígitos
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return `+${digits}`;
}
