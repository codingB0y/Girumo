import assert from "node:assert/strict";
import {
  deriveHealth,
  silenceRisk,
  LINKED_DEVICE_TIMEOUT_DAYS,
  SILENCE_WARNING_DAYS,
  type InstanceHealthRow,
} from "./instance-health";

const NOW = new Date("2026-08-29T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const secondsAhead = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString();

/** Linha saudável de referência; cada teste muda só o campo em questão. */
function row(over: Partial<InstanceHealthRow> = {}): InstanceHealthRow {
  return {
    instance_id: "i-1",
    phone: "5511999999999",
    status: "connected",
    connected_at: daysAgo(30),
    warmup_day: 2,
    warmup_graduated: false,
    daily_cap: 41,
    sent_24h: 10,
    sent_1h: 3,
    sent_1m: 0,
    next_send_allowed_at: null,
    paused_until: null,
    consecutive_failures: 0,
    failures_24h: 0,
    last_active_at: daysAgo(0),
    last_event_at: daysAgo(0),
    perfil: "novo",
    per_hour: 40,
    per_min: 8,
    admin_groups: 3,
    ...over,
  };
}

// === Aquecimento ===

// Dia do warmup e teto vêm do banco; a tela não recalcula a regra.
{
  const h = deriveHealth(row({ warmup_day: 2, daily_cap: 41, sent_24h: 10 }), NOW);
  assert.equal(h.warmupDay, 2);
  assert.equal(h.dailyCap, 41);
  assert.equal(h.usedToday, 10);
  assert.ok(Math.abs(h.usedRatio - 10 / 41) < 1e-9);
}

// Graduado não tem "dia N" — mostrar "dia 8 de aquecimento" seria mentira.
{
  const h = deriveHealth(row({ warmup_graduated: true, warmup_day: 9, daily_cap: 800 }), NOW);
  assert.equal(h.warmupDay, null);
  assert.equal(h.graduated, true);
}

// Teto zero não pode virar divisão por zero na barra de uso.
assert.equal(deriveHealth(row({ daily_cap: 0, sent_24h: 0 }), NOW).usedRatio, 0);

// Uso acima do teto (janela de 24h vs. teto recalculado) satura em 100%.
assert.equal(deriveHealth(row({ daily_cap: 20, sent_24h: 35 }), NOW).usedRatio, 1);

// === Espaçamento ===

// Gate no futuro vira contagem regressiva; no passado é 0 (livre agora).
assert.equal(deriveHealth(row({ next_send_allowed_at: secondsAhead(4) }), NOW).nextSendInSeconds, 4);
assert.equal(deriveHealth(row({ next_send_allowed_at: daysAgo(1) }), NOW).nextSendInSeconds, 0);
assert.equal(deriveHealth(row({ next_send_allowed_at: null }), NOW).nextSendInSeconds, 0);

// === Tom ===

assert.equal(deriveHealth(row(), NOW).tone, "ok");
// Falhas seguidas sem pausa ainda = atenção, não risco.
assert.equal(deriveHealth(row({ consecutive_failures: 2 }), NOW).tone, "atencao");
// Breaker ativo = risco, e a pausa é exposta em segundos.
{
  const h = deriveHealth(row({ paused_until: secondsAhead(60), consecutive_failures: 5 }), NOW);
  assert.equal(h.tone, "risco");
  assert.equal(h.pausedSeconds, 60);
}
// Desconectado é risco mesmo com todo o resto perfeito.
assert.equal(deriveHealth(row({ status: "disconnected" }), NOW).tone, "risco");

// === Risco dos 14 dias ===

// Sessão ativa hoje: sem risco, prazo cheio.
{
  const r = silenceRisk(row(), NOW);
  assert.ok(r);
  assert.equal(r.silentDays, 0);
  assert.equal(r.daysLeft, LINKED_DEVICE_TIMEOUT_DAYS);
  assert.equal(r.shouldWarn, false);
}

// Um dia antes do limiar ainda não avisa — o aviso tem que ser raro pra valer.
assert.equal(silenceRisk(row({ last_event_at: daysAgo(SILENCE_WARNING_DAYS - 1), last_active_at: null }), NOW)?.shouldWarn, false);

// No limiar, avisa e informa a margem restante.
{
  const r = silenceRisk(row({ last_event_at: daysAgo(SILENCE_WARNING_DAYS), last_active_at: null }), NOW);
  assert.equal(r?.shouldWarn, true);
  assert.equal(r?.daysLeft, LINKED_DEVICE_TIMEOUT_DAYS - SILENCE_WARNING_DAYS);
}

// Passado o prazo, daysLeft satura em 0 em vez de virar negativo.
assert.equal(silenceRisk(row({ last_event_at: daysAgo(30), last_active_at: null }), NOW)?.daysLeft, 0);

// O sinal é o MAIS RECENTE entre evento, envio e conexão: um envio de hoje
// desmente um last_event_at antigo. Sem isso, quem só dispara (e não recebe
// evento) receberia alarme falso.
assert.equal(
  silenceRisk(row({ last_event_at: daysAgo(20), last_active_at: daysAgo(0) }), NOW)?.shouldWarn,
  false,
);

// Desconectado não entra nesta conta: quem cuida disso é o alerta de
// desconexão de 2h (cron/emails Job 3). Dois alarmes para o mesmo fato seria ruído.
assert.equal(silenceRisk(row({ status: "disconnected", last_event_at: daysAgo(30) }), NOW), null);

// Sem sinal nenhum (nunca conectou de fato) não há o que medir.
assert.equal(
  silenceRisk(row({ last_event_at: null, last_active_at: null, connected_at: null }), NOW),
  null,
);

// Relógio adiantado no banco não pode virar "silêncio negativo".
assert.equal(silenceRisk(row({ last_event_at: daysAgo(-2) }), NOW), null);

// === Histórico de pareamento ===
//
// `everConnected` é o que separa "caiu" de "nunca pareou". A tela some para o
// segundo e permanece para o primeiro — sumir com o número fora do ar é
// esconder a informação na única hora em que ela importa.
{
  const caiu = deriveHealth(row({ status: "disconnected", connected_at: daysAgo(30) }), NOW);
  assert.equal(caiu.connected, false);
  assert.equal(caiu.everConnected, true, "numero que ja pareou mantem historico");

  const nuncaPareou = deriveHealth(row({ status: "qr", connected_at: null }), NOW);
  assert.equal(nuncaPareou.connected, false);
  assert.equal(nuncaPareou.everConnected, false, "instancia criada e nunca pareada nao tem historico");

  const vivo = deriveHealth(row(), NOW);
  assert.equal(vivo.everConnected, true);
}

// === Perfil e tetos por hora/minuto ===
//
// Vêm prontos de app.instance_caps (via instance_health); a tela só expõe o
// que o banco já decidiu, não recalcula a rampa nem os tetos.
{
  const h = deriveHealth(
    row({ perfil: "veterano", per_hour: 273, per_min: 10, admin_groups: 91, daily_cap: 1365 }),
    NOW,
  );
  assert.equal(h.perfil, "veterano");
  assert.equal(h.hourlyCap, 273);
  assert.equal(h.minuteCap, 10);
  assert.equal(h.adminGroups, 91);
  assert.equal(h.dailyCap, 1365);
}

console.log("instance-health tests passed");
