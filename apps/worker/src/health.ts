import http from "node:http";

/**
 * Endpoint /health para o healthcheck do Coolify.
 *
 * Degradado (503) quando o último ciclo falhou no nível de banco — é o sinal que
 * faz o Coolify reiniciar o container se o Supabase ficou inalcançável. Falha por
 * evento não degrada o worker: o loop continua e o evento vira 'failed'.
 */

export type HealthState = {
  healthy: boolean;
  lastTickAt: number | null;
  lastError: string | null;
};

export function startHealthServer(
  port: number,
  getState: () => HealthState,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const state = getState();
      const body = JSON.stringify({
        status: state.healthy ? "ok" : "degraded",
        last_tick_at: state.lastTickAt,
        last_error: state.lastError,
      });
      res.writeHead(state.healthy ? 200 : 503, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port);
  return server;
}
