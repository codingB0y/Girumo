/**
 * O número para o pareamento por código, no formato que a Evolution espera:
 * só dígitos, com DDI.
 *
 * O WhatsApp só aceita o código no celular do número informado — número errado
 * não conecta nada, só gasta a tentativa. Por isso a validação é de forma, não
 * de dono: quem digita é o lojista, no próprio painel.
 *
 * Com `+` ou `00` na frente, os dígitos já trazem o DDI e passam como vieram —
 * senão um número americano (`+1 415 555 2671`, 11 dígitos) viraria brasileiro.
 * Sem eles, o 0 de operadora (`(011)`) sai, e 10 ou 11 dígitos é DDD + número
 * brasileiro, que ganha o 55.
 */
const MINIMO_COM_DDI = 11;
const MAXIMO_E164 = 15;

export function normalizarTelefonePareamento(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digitos = raw.replace(/\D/g, "");
  const comDdi = raw.trim().startsWith("+")
    ? digitos
    : digitos.startsWith("00")
      ? digitos.slice(2)
      : brasileiro(digitos.replace(/^0/, ""));
  if (comDdi.length < MINIMO_COM_DDI || comDdi.length > MAXIMO_E164) return null;
  return comDdi;
}

function brasileiro(digitos: string): string {
  return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
}
