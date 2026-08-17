/**
 * Decide se um alerta pode ser enviado, a partir da leitura da preferência do
 * lojista em `tenant_settings`.
 *
 * Falha FECHADO. Se a leitura deu erro (tabela ausente, permissão, timeout) não
 * dá para saber a preferência — e enviar assim mesmo significaria e-mail para
 * quem desligou. Um alerta atrasado é recuperável; um alerta que o lojista
 * pediu para não receber queima a confiança dele na caixa de entrada.
 *
 * Sem linha em `tenant_settings` (value undefined/null) = lojista nunca abriu a
 * tela = recebe. Todo alerta nasce ligado; a preferência existe para desligar.
 */
export type PreferenceRead = {
  /** Valor da coluna. `null`/`undefined` quando não há linha para o tenant. */
  value: boolean | null | undefined;
  /** Erro da leitura, no formato que o supabase-js devolve. */
  error: unknown;
};

export function canSendAlert({ value, error }: PreferenceRead): boolean {
  if (error) return false;
  return value !== false;
}
