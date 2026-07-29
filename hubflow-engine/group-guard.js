/**
 * GroupOperationGuard — limita operações de grupo (add/remove/create/invite)
 * para evitar account_reachout_restricted e rate-overlimit.
 * Porte (seguro) do baileys-antiban/groupOperationGuard.ts. Só limita ritmo.
 *
 * Limites não-oficiais observados: ~3 adds/10min, 2 creates/10min.
 */
const DEFAULT_LIMITS = {
  add: { max: 3, windowMs: 600_000 },
  remove: { max: 5, windowMs: 600_000 },
  create: { max: 2, windowMs: 600_000 },
  invite: { max: 10, windowMs: 600_000 },
};

const GROUP_OP_ERRORS = {
  REACHOUT_RESTRICTED: "account_reachout_restricted",
  RATE_OVERLIMIT: "rate-overlimit",
  PRIVACY_BLOCK: "403",
  INVITE_EXPIRED: "gone",
  GROUP_LOCKED: "locked",
};

/** Classifica um erro de operação de grupo (null se não reconhecido). */
function classifyGroupOpError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("account_reachout_restricted") || msg.includes("reachout"))
    return GROUP_OP_ERRORS.REACHOUT_RESTRICTED;
  if (msg.includes("rate-overlimit") || msg.includes("429")) return GROUP_OP_ERRORS.RATE_OVERLIMIT;
  if (msg.includes("locked")) return GROUP_OP_ERRORS.GROUP_LOCKED;
  if (msg.includes("gone")) return GROUP_OP_ERRORS.INVITE_EXPIRED;
  return null;
}

class GroupOperationGuard {
  constructor(config = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...(config.limits ?? {}) };
    this.buckets = {};
  }

  _bucket(op) {
    const lim = this.limits[op];
    const now = Date.now();
    let b = this.buckets[op];
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + lim.windowMs };
      this.buckets[op] = b;
    }
    return b;
  }

  /** Verifica se a operação é permitida agora. */
  check(op) {
    const lim = this.limits[op];
    if (!lim) return { allowed: true };
    const b = this._bucket(op);
    if (b.count >= lim.max) {
      return {
        allowed: false,
        reason: `Limite de "${op}" atingido (${lim.max}/${lim.windowMs / 60000}min)`,
        retryAfterSec: Math.ceil((b.resetAt - Date.now()) / 1000),
      };
    }
    return { allowed: true };
  }

  /** Contabiliza uma operação executada. */
  record(op) {
    if (!this.limits[op]) return;
    this._bucket(op).count++;
  }

  stats() {
    const out = {};
    for (const [op, b] of Object.entries(this.buckets)) {
      out[op] = { count: b.count, resetInSec: Math.max(0, Math.ceil((b.resetAt - Date.now()) / 1000)) };
    }
    return out;
  }
}

module.exports = { GROUP_OP_ERRORS, classifyGroupOpError, GroupOperationGuard };
