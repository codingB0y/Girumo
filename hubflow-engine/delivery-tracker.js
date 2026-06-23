/**
 * DeliveryTracker — mede taxa de entrega real (enviadas vs. entregues).
 * Porte (seguro) do baileys-antiban/deliveryTracker.ts. Só monitora — não altera envio.
 * Entrega < 60% é sinal forte de soft-ban.
 */
export class DeliveryTracker {
  constructor(config = {}) {
    this.cfg = {
      windowMs: 3_600_000, // 1h
      minSampleSize: 10,
      lowRateThreshold: 0.6,
      onLowDeliveryRate: () => {},
      ...config,
    };
    this.messages = new Map(); // msgId -> { sentAt, delivered }
    this.lastAlert = 0;
  }

  onMessageSent(msgId) {
    if (!msgId) return;
    this.messages.set(msgId, { sentAt: Date.now(), delivered: false });
    this._prune();
  }

  onDeliveryReceipt(msgId) {
    const rec = this.messages.get(msgId);
    if (rec) rec.delivered = true;
    this._prune();
    this._check();
  }

  _prune() {
    const cutoff = Date.now() - this.cfg.windowMs;
    for (const [id, rec] of this.messages) {
      if (rec.sentAt < cutoff) this.messages.delete(id);
    }
  }

  getStats() {
    this._prune();
    let sent = 0;
    let delivered = 0;
    for (const rec of this.messages.values()) {
      sent++;
      if (rec.delivered) delivered++;
    }
    const rate = sent >= this.cfg.minSampleSize ? delivered / sent : null;
    return { sentInWindow: sent, deliveredInWindow: delivered, deliveryRate: rate };
  }

  _check() {
    const { deliveryRate } = this.getStats();
    if (deliveryRate === null) return;
    const now = Date.now();
    if (deliveryRate < this.cfg.lowRateThreshold && now - this.lastAlert > 300_000) {
      this.lastAlert = now;
      this.cfg.onLowDeliveryRate(deliveryRate);
    }
  }
}
