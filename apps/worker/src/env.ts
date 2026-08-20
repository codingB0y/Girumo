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
  /**
   * Config da Evolution API para o loop de ENVIO (F4). Opcional: sem as duas, o
   * worker roda só a captura de leads (loop B) e o sender fica desligado —
   * mesma postura fail-safe do worker legado sem config Supabase.
   */
  evolutionApiUrl: string | null;
  evolutionApiKey: string | null;
  /** Máximo de comandos de envio por claim (o anti-ban do claim limita o resto). */
  sendBatchSize: number;
  /**
   * Envio real. Default `false` (DRY-RUN): o loop faz tudo — claim sob anti-ban,
   * resolve instância, assina mídia, conta a janela e fecha o comando — menos a
   * chamada HTTP à Evolution, que vira log. Ligar só depois de ler esses logs: o
   * histórico deste projeto tem um fan-out de 193 comandos que só não virou 193
   * mensagens porque não havia consumidor.
   */
  sendEnabled: boolean;
  /**
   * Base do app web e token da engine, para o loop de AUTO-GROW. Sem os dois o
   * loop fica desligado — o gate que decide quando criar grupo vive no app
   * (`evaluateAutoGrow`), então sem falar com ele não há o que executar.
   */
  appBaseUrl: string | null;
  engineToken: string | null;
  /**
   * Criação real de grupo. Default `false` (DRY-RUN), pela mesma razão do envio e
   * com mais motivo: criar grupo é irreversível do lado do WhatsApp e gasta a
   * janela anti-ban de `create`, que é a operação que mais aproxima do ban.
   */
  growEnabled: boolean;
  /**
   * Intervalo entre ciclos de auto-grow. É ele que FAZ o anti-ban: com 1 criação
   * por tenant por ciclo, 5 min dá ~2/10min — o mesmo teto do GroupOperationGuard
   * que a engine Baileys aplicava em memória. Baixar isto afrouxa o anti-ban.
   */
  growIntervalMs: number;
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

function optionalEnv(name: string): string | null {
  const raw = process.env[name];
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

/** Só `"true"` liga. Qualquer outra coisa — inclusive vazio ou lixo — é dry-run. */
function boolEnv(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}

export function loadEnv(): WorkerEnv {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    pollMs: intEnv("WORKER_POLL_MS", 3000, 250),
    batchSize: intEnv("WORKER_BATCH_SIZE", 20, 1),
    requeueAfterSeconds: intEnv("WORKER_REQUEUE_AFTER_SECONDS", 300, 30),
    healthPort: intEnv("WORKER_HEALTH_PORT", 3002, 1),
    evolutionApiUrl: optionalEnv("EVOLUTION_API_URL"),
    evolutionApiKey: optionalEnv("EVOLUTION_API_KEY"),
    sendBatchSize: intEnv("WORKER_SEND_BATCH_SIZE", 10, 1),
    sendEnabled: boolEnv("WORKER_SEND_ENABLED"),
    appBaseUrl: optionalEnv("APP_URL"),
    engineToken: optionalEnv("ENGINE_TOKEN"),
    growEnabled: boolEnv("WORKER_GROW_ENABLED"),
    // Mínimo de 60s: abaixo disso a cadência deixa de ser um teto anti-ban crível.
    growIntervalMs: intEnv("WORKER_GROW_INTERVAL_MS", 5 * 60_000, 60_000),
  };
}
