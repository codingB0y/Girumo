// Seleção da instância que representa a sessão do WhatsApp.
//
// Múltiplas linhas podem coexistir em `instances` pro mesmo tenant
// (connected, qr, connecting, disconnected). Pegar só "a mais recente"
// deixa uma linha qr/connecting recém-tocada mascarar a connected e derrubar
// o painel. Aqui a regra é: preferir a CONECTADA mais recente; sem nenhuma
// conectada, cair pra mais recente no geral.
//
// Sem `server-only`/Supabase de propósito — lógica pura, testável isolada.

export type SelectableRow = {
  status: string | null;
  updated_at: string | null;
};

export function isConnectedStatus(status: unknown): boolean {
  return status === "connected" || status === "online";
}

function toTime(iso: string | null): number {
  if (!iso) return 0;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Escolhe a instância que representa a sessão a partir de linhas de `instances`.
 * Não depende da ordem de entrada: ordena por `updated_at` desc internamente e
 * então prioriza `status` conectado (`connected`/`online`).
 */
export function selectSessionRow<T extends SelectableRow>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;

  const byRecent = [...rows].sort((a, b) => toTime(b.updated_at) - toTime(a.updated_at));

  return byRecent.find((row) => isConnectedStatus(row.status)) ?? byRecent[0];
}
