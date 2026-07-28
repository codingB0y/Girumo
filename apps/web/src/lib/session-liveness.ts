// Liveness da sessão do WhatsApp — lógica pura, sem `server-only`, testável
// isolada (mesmo padrão de session-select.ts).

export type LivenessInput = {
  status: "connected" | "disconnected";
  updatedAt: string;
};

// `updated_at` só é tocado em evento connection.update (transição de estado
// via webhook Evolution), não é heartbeat periódico — uma conexão estável
// passa horas sem gerar transição nenhuma. Um teto curto (ex.: 90s) marcava
// "desconectado" qualquer sessão saudável parada; o teto aqui só existe pra
// pegar instância genuinamente abandonada
// (achado: finding-painel-heartbeat-false-disconnect na memória do projeto).
export const STALE_CONNECTED_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** "Ao vivo" = status conectado E sem ficar abandonada por mais de 24h. */
export function isLive(info: LivenessInput): boolean {
  return (
    info.status === "connected" &&
    Date.now() - new Date(info.updatedAt).getTime() < STALE_CONNECTED_THRESHOLD_MS
  );
}
