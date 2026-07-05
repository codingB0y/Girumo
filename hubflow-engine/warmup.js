/**
 * WarmUp — rampa gradual de volume para número novo ou reconectado após pausa.
 * Porte (seguro) do baileys-antiban/warmup.ts. Apenas LIMITA envio — não forja nada.
 * Número novo que vai de 0 a 100 msgs/dia da noite pro dia é o maior sinal de spam.
 */
function randomGrowthFactor() {
  return Math.round((1.5 + Math.random() * 0.7) * 100) / 100; // [1.5, 2.2]
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

class WarmUp {
  constructor(config = {}, state = null) {
    this.cfg = {
      warmUpDays: 7,
      day1Limit: 20,
      inactivityThresholdHours: 72,
      growthFactor: config.growthFactor ?? randomGrowthFactor(),
      ...config,
    };
    this.state = state ?? this.fresh();
  }

  fresh() {
    return {
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      graduated: false,
      todaySentCount: 0,
      todayDate: today(),
    };
  }

  getCurrentDay() {
    return Math.floor((Date.now() - this.state.startedAt) / 86_400_000);
  }

  /** Limite de mensagens permitido HOJE (Infinity quando graduado). */
  getDailyLimit() {
    this.checkInactivity();
    if (this.state.graduated) return Infinity;
    const day = this.getCurrentDay();
    if (day >= this.cfg.warmUpDays) {
      this.state.graduated = true;
      return Infinity;
    }
    return Math.round(this.cfg.day1Limit * Math.pow(this.cfg.growthFactor, day));
  }

  /** Reentra em warm-up após longa inatividade. */
  checkInactivity() {
    const gapH = (Date.now() - this.state.lastActiveAt) / 3_600_000;
    if (!this.state.graduated && gapH >= this.cfg.inactivityThresholdHours) {
      this.state = this.fresh();
    }
  }

  _rollDay() {
    const d = today();
    if (this.state.todayDate !== d) {
      this.state.todayDate = d;
      this.state.todaySentCount = 0;
    }
  }

  /** Registra um envio (chamado pela fila a cada mensagem enviada). */
  record() {
    this._rollDay();
    this.state.todaySentCount++;
    this.state.lastActiveAt = Date.now();
  }

  status() {
    this._rollDay();
    const limit = this.getDailyLimit();
    return {
      phase: this.state.graduated ? "graduated" : "warming",
      day: Math.min(this.getCurrentDay() + 1, this.cfg.warmUpDays),
      totalDays: this.cfg.warmUpDays,
      todayLimit: limit === Infinity ? "∞" : limit,
      todaySent: this.state.todaySentCount,
    };
  }
}

module.exports = { WarmUp };
