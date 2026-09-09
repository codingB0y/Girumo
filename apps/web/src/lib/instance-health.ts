// Saúde do número — regras puras de derivação, sem `server-only`, testáveis
// isoladas (mesmo padrão de session-liveness.ts).
//
// O anti-ban real vive no banco (20260729120000_engine_antiban_state.sql) e é
// aplicado dentro do claim. Aqui nada é decidido sobre envio: só traduzimos o
// estado que o banco já calculou para o que o lojista precisa entender.

/** Linha crua da RPC `public.instance_health`. */
export type InstanceHealthRow = {
  instance_id: string;
  phone: string | null;
  status: string;
  connected_at: string | null;
  warmup_day: number;
  warmup_graduated: boolean;
  daily_cap: number;
  sent_24h: number;
  sent_1h: number;
  sent_1m: number;
  next_send_allowed_at: string | null;
  paused_until: string | null;
  consecutive_failures: number;
  failures_24h: number;
  last_active_at: string | null;
  last_event_at: string | null;
  /** "novo" | "veterano" — decidido por app.instance_caps, não recalculado aqui. */
  perfil: "novo" | "veterano";
  per_hour: number;
  per_min: number;
  admin_groups: number;
};

/**
 * O WhatsApp desliga TODOS os dispositivos vinculados quando o celular
 * principal passa 14 dias sem se conectar. Não é erro nem ban: a sessão
 * simplesmente some, sem aviso. É o único risco do produto que o lojista pode
 * evitar sozinho — e nenhum concorrente avisa.
 */
export const LINKED_DEVICE_TIMEOUT_DAYS = 14;

/** Quantos dias de silêncio antes de avisar (deixa ~4 dias de margem). */
export const SILENCE_WARNING_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SilenceRisk = {
  /** Dias inteiros desde o último sinal de vida da sessão. */
  silentDays: number;
  /** Dias restantes até o corte dos 14, nunca negativo. */
  daysLeft: number;
  /** Passou do limiar de aviso e ainda não estourou o prazo. */
  shouldWarn: boolean;
};

/**
 * Risco de queda por inatividade do celular principal.
 *
 * O sinal é o SILÊNCIO da trilha de eventos (`engine_events`), não o
 * `last_seen_at` da instância: este último só é tocado em transição de
 * `connection.update`, então uma sessão saudável passa semanas sem mexer nele
 * (ver session-liveness.ts). Silêncio total de eventos é a melhor evidência
 * disponível de que o aparelho parou — e o texto do aviso diz exatamente isso,
 * "não vemos atividade", nunca "seu celular está desligado", que seria uma
 * afirmação que não podemos sustentar.
 *
 * Devolve null quando não há sinal nenhum para medir (número que nunca
 * conectou) — avisar aí seria ruído.
 */
export function silenceRisk(row: InstanceHealthRow, now: Date = new Date()): SilenceRisk | null {
  if (!isConnected(row)) return null;

  const lastSignal = mostRecent([row.last_event_at, row.last_active_at, row.connected_at]);
  if (lastSignal === null) return null;

  const silentDays = Math.floor((now.getTime() - lastSignal) / DAY_MS);
  if (silentDays < 0) return null;

  return {
    silentDays,
    daysLeft: Math.max(0, LINKED_DEVICE_TIMEOUT_DAYS - silentDays),
    shouldWarn: silentDays >= SILENCE_WARNING_DAYS,
  };
}

export type HealthTone = "ok" | "atencao" | "risco";

export type NumberHealth = {
  instanceId: string;
  phone: string | null;
  connected: boolean;
  /**
   * Ja houve pareamento bem-sucedido alguma vez (`connected_at` carimbado).
   *
   * Separa "numero que caiu" de "numero que nunca pareou", que e a diferenca
   * entre mostrar historico util e mostrar rampa de aquecimento para quem
   * sequer escaneou o QR.
   */
  everConnected: boolean;
  /** Aquecimento em base 1; null depois de graduar. */
  warmupDay: number | null;
  graduated: boolean;
  dailyCap: number;
  usedToday: number;
  /** Quanto do teto do dia já foi usado, 0–1. */
  usedRatio: number;
  sentLastHour: number;
  failures24h: number;
  /** Segundos até o próximo envio ser liberado; 0 = livre agora. */
  nextSendInSeconds: number;
  /** Pausa do circuit breaker ainda ativa. */
  pausedSeconds: number;
  silence: SilenceRisk | null;
  tone: HealthTone;
  perfil: "novo" | "veterano";
  hourlyCap: number;
  minuteCap: number;
  adminGroups: number;
};

/** Traduz a linha da RPC para o que a tela mostra. */
export function deriveHealth(row: InstanceHealthRow, now: Date = new Date()): NumberHealth {
  const connected = isConnected(row);
  const silence = silenceRisk(row, now);
  const pausedSeconds = secondsUntil(row.paused_until, now);
  const dailyCap = Math.max(0, row.daily_cap);
  const usedToday = Math.max(0, row.sent_24h);

  return {
    instanceId: row.instance_id,
    phone: row.phone,
    connected,
    everConnected: row.connected_at !== null,
    warmupDay: row.warmup_graduated ? null : Math.max(1, row.warmup_day),
    graduated: row.warmup_graduated,
    dailyCap,
    usedToday,
    usedRatio: dailyCap > 0 ? Math.min(1, usedToday / dailyCap) : 0,
    sentLastHour: Math.max(0, row.sent_1h),
    failures24h: Math.max(0, row.failures_24h),
    nextSendInSeconds: secondsUntil(row.next_send_allowed_at, now),
    pausedSeconds,
    silence,
    // Pausa do breaker e risco de queda são os dois estados que pedem ação do
    // lojista; aquecimento e espaçamento são o sistema funcionando como deve.
    tone: !connected || pausedSeconds > 0 || silence?.shouldWarn ? "risco"
      : row.consecutive_failures > 0 ? "atencao"
      : "ok",
    perfil: row.perfil,
    hourlyCap: Math.max(0, row.per_hour),
    minuteCap: Math.max(0, row.per_min),
    adminGroups: Math.max(0, row.admin_groups),
  };
}

function isConnected(row: InstanceHealthRow): boolean {
  return row.status === "connected";
}

function secondsUntil(iso: string | null, now: Date): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - now.getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}

function mostRecent(values: (string | null)[]): number | null {
  const times = values
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v).getTime())
    .filter((t) => Number.isFinite(t));
  return times.length > 0 ? Math.max(...times) : null;
}
