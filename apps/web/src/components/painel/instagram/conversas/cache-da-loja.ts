/**
 * Cache de módulo, por loja, durante a sessão da página: abrir outra conversa ou reabrir um painel não refaz a consulta.
 * Sem `tenantId` (papel ainda não carregou) não guarda nada.
 */
const guardado = new Map<string, unknown>();
const chave = (espaco: string, tenantId: string | null): string | null => (tenantId ? `${espaco}:${tenantId}` : null);

export function lerDoCache<T>(espaco: string, tenantId: string | null): T | undefined {
  const k = chave(espaco, tenantId);
  return k ? (guardado.get(k) as T | undefined) : undefined;
}

export function guardarNoCache(espaco: string, tenantId: string | null, valor: unknown): void {
  const k = chave(espaco, tenantId);
  if (k) guardado.set(k, valor);
}

export function limparDoCache(espaco: string, tenantId: string | null): void {
  const k = chave(espaco, tenantId);
  if (k) guardado.delete(k);
}
