import { setTimeout as delay } from "timers/promises";

/**
 * Fila anti-ban — controles operacionais SEGUROS (sem evasão/stealth).
 * Inspirada na WaSP (kobie3717/wasp): delays humanizados + lanes de prioridade
 * + governor de throughput. Acrescenta backoff exponencial e circuit breaker.
 *
 * Importante: NENHUMA fila garante não-ban. Isto apenas reduz o risco mantendo
 * um ritmo de envio parecido com o humano e dentro de limites por minuto/hora/dia.
 */
export class AntiBanQueue {
  constructor(opts = {}) {
    // Delay humanizado entre envios (lane normal)
    this.minDelayMs = opts.minDelayMs ?? 2000;
    this.maxDelayMs = opts.maxDelayMs ?? 5000;
    // Lane de prioridade: ritmo mais ágil (ex.: resposta a quem acabou de entrar)
    this.priorityDelayMs = opts.priorityDelayMs ?? 1000;

    // Governor de throughput (limites por janela)
    this.maxPerMinute = opts.maxPerMinute ?? 12;
    this.maxPerHour = opts.maxPerHour ?? 200;
    this.maxPerDay = opts.maxPerDay ?? 1000;

    // Retentativas com backoff exponencial
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffBaseMs = opts.backoffBaseMs ?? 2000;

    // Circuit breaker: pausa após falhas consecutivas
    this.breakerThreshold = opts.breakerThreshold ?? 5;
    this.breakerCooldownMs = opts.breakerCooldownMs ?? 60_000;

    // Hook de cap diário externo (ex.: WarmUp) e callback pós-envio.
    this.getDailyCap = opts.getDailyCap ?? (() => Infinity);
    // Hook de teto POR HORA (ex.: derivado do WarmUp) — espalha a cota do número
    // novo pelo dia em vez de deixar disparar tudo em poucos minutos (burst = bot).
    this.getMaxPerHour = opts.getMaxPerHour ?? (() => Infinity);
    this.onSent = opts.onSent ?? (() => {});

    this.high = [];
    this.normal = [];
    this.sentTimestamps = [];
    this.consecutiveFailures = 0;
    this.paused = false;
    this.running = false;
    this.log = opts.onLog ?? (() => {});
  }

  /** Jitter gaussiano (Box-Muller) entre min e max — mais natural que uniforme. */
  _gaussianDelay(min, max) {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    let n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); // ~N(0,1)
    n /= 3; // ~99.7% dentro de [-1, 1]
    const mid = (min + max) / 2;
    const half = (max - min) / 2;
    return Math.round(Math.max(min, Math.min(max, mid + n * half)));
  }

  /** Enfileira uma tarefa de envio. Retorna uma Promise com o resultado. */
  enqueue(task, { priority = false } = {}) {
    return new Promise((resolve, reject) => {
      const item = { task, resolve, reject, attempts: 0 };
      (priority ? this.high : this.normal).push(item);
      this._run();
    });
  }

  size() {
    return this.high.length + this.normal.length;
  }

  pause() {
    this.paused = true;
    this.log("⏸️  Fila pausada.");
  }

  resume() {
    this.paused = false;
    this.consecutiveFailures = 0;
    this.log("▶️  Fila retomada.");
    this._run();
  }

  stats() {
    const now = Date.now();
    const since = (ms) => this.sentTimestamps.filter((t) => now - t < ms).length;
    return {
      pendentes: this.size(),
      enviadasUltimoMinuto: since(60_000),
      enviadasUltimaHora: since(3_600_000),
      enviadasHoje: since(86_400_000),
      pausada: this.paused,
    };
  }

  _rand(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  /** Espera até haver capacidade dentro dos limites por minuto/hora/dia. */
  async _waitForCapacity() {
    for (;;) {
      const now = Date.now();
      this.sentTimestamps = this.sentTimestamps.filter((t) => now - t < 86_400_000);
      const dayCap = Math.min(this.maxPerDay, this.getDailyCap()); // WarmUp pode reduzir o teto
      const hourCap = Math.min(this.maxPerHour, this.getMaxPerHour()); // WarmUp espalha por hora
      const windows = [
        { arr: this.sentTimestamps.filter((t) => now - t < 60_000), cap: this.maxPerMinute, span: 60_000 },
        { arr: this.sentTimestamps.filter((t) => now - t < 3_600_000), cap: hourCap, span: 3_600_000 },
        { arr: this.sentTimestamps, cap: dayCap, span: 86_400_000 },
      ];
      let waitMs = 0;
      for (const w of windows) {
        if (w.arr.length >= w.cap) {
          // sentTimestamps é cronológico crescente (push em ordem + restauração preserva ordem),
          // então o mais antigo da janela é arr[0] — evita Math.min(...arr) (spread de array grande).
          waitMs = Math.max(waitMs, w.span - (now - w.arr[0]));
        }
      }
      if (waitMs <= 0) return;
      this.log(`⏳ Limite de envio atingido. Aguardando ~${Math.ceil(waitMs / 1000)}s...`);
      await delay(Math.min(waitMs, 5000)); // re-checa periodicamente
    }
  }

  async _run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.size() > 0) {
        if (this.paused) {
          await delay(1000);
          continue;
        }

        const isPriority = this.high.length > 0;
        const item = isPriority ? this.high.shift() : this.normal.shift();

        await this._waitForCapacity();

        try {
          const result = await item.task();
          this.sentTimestamps.push(Date.now());
          this.consecutiveFailures = 0;
          this.onSent(result); // ex.: WarmUp.record() + DeliveryTracker.onMessageSent()
          item.resolve(result);
        } catch (err) {
          item.attempts++;
          if (item.attempts <= this.maxRetries) {
            const backoff = this.backoffBaseMs * 2 ** (item.attempts - 1) + this._rand(0, 500);
            this.log(`⚠️  Falha (tentativa ${item.attempts}/${this.maxRetries}). Retry em ${backoff}ms.`);
            (isPriority ? this.high : this.normal).unshift(item); // reprocessa
            await delay(backoff);
            continue;
          }
          this.consecutiveFailures++;
          item.reject(err);
          if (this.consecutiveFailures >= this.breakerThreshold) {
            this.log(
              `🛑 Circuit breaker: ${this.consecutiveFailures} falhas seguidas. Pausando ${this.breakerCooldownMs / 1000}s.`,
            );
            this.paused = true;
            setTimeout(() => {
              this.paused = false;
              this.consecutiveFailures = 0;
              this.log("▶️  Circuit breaker liberado. Retomando.");
              this._run();
            }, this.breakerCooldownMs);
          }
        }

        // Delay humanizado entre envios (gaussiano na lane normal)
        const gap = isPriority
          ? this.priorityDelayMs
          : this._gaussianDelay(this.minDelayMs, this.maxDelayMs);
        await delay(gap);
      }
    } finally {
      this.running = false;
    }
  }
}
