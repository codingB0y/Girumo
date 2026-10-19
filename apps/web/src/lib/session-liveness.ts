// Liveness da sessão do WhatsApp — lógica pura, sem `server-only`, testável
// isolada (mesmo padrão de session-select.ts).

export type LivenessInput = {
  status: "connected" | "disconnected";
  updatedAt: string;
};

// `updated_at` só é tocado em evento connection.update (transição de estado
// via webhook Evolution), não é heartbeat — uma conexão estável passa dias sem
// transição nenhuma. Qualquer teto sobre `updated_at` (já foi 90s, depois 24h)
// marca "desconectado" justamente o número que está funcionando bem. Por isso
// o status é a única fonte: quem derruba a sessão é o connection.update de
// close/disconnected (achado: isLive-teto-24h-e-proxy-de-heartbeat).
export function isLive(info: LivenessInput): boolean {
  return info.status === "connected";
}
