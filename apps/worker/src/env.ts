/**
 * Configuração do worker, lida do ambiente uma vez no boot.
 *
 * Falha rápido: sem SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY o worker não tem o
 * que fazer, então aborta com mensagem clara em vez de rodar em loop quebrado.
 */

export type WorkerEnv = {
  supabaseUrl: string;
  supabaseServiceKey: string;
  /** Intervalo entre ciclos de claim, em ms. */
  pollMs: number;
  /** Máximo de eventos por claim. */
  batchSize: number;
  /** Idade (s) a partir da qual um evento preso em 'processing' é reenfileirado. */
  requeueAfterSeconds: number;
  /** Porta do endpoint /health (healthcheck do Coolify). */
  healthPort: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`Variavel ${name} invalida: "${raw}" (esperado inteiro >= ${min})`);
  }
  return parsed;
}

export function loadEnv(): WorkerEnv {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    pollMs: intEnv("WORKER_POLL_MS", 3000, 250),
    batchSize: intEnv("WORKER_BATCH_SIZE", 20, 1),
    requeueAfterSeconds: intEnv("WORKER_REQUEUE_AFTER_SECONDS", 300, 30),
    healthPort: intEnv("WORKER_HEALTH_PORT", 3002, 1),
  };
}
