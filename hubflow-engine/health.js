function buildHealthResponse(kind, state = {}) {
  const whatsappConnected = Boolean(state.whatsappConnected);
  const isLive = kind === "live";
  const ok = isLive || whatsappConnected;

  return {
    statusCode: ok ? 200 : 503,
    body: {
      ok,
      service: "hubflow-engine",
      status: isLive ? "live" : whatsappConnected ? "ready" : "not_ready",
      whatsappConnected,
      supabaseWorker: Boolean(state.supabaseWorker),
      uptime: Number.isFinite(state.uptime) ? state.uptime : 0,
    },
  };
}

function createHealthHandler(kind, getState) {
  return (_request, response) => {
    const result = buildHealthResponse(kind, getState());
    return response.status(result.statusCode).json(result.body);
  };
}

module.exports = { buildHealthResponse, createHealthHandler };
